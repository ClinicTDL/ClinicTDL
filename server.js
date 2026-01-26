import express from 'express'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const app = express()
app.use(express.json({ limit: '10mb' }))

let supabaseAdmin = null
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://defyvntymvoshsomvsrr.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'patient-photos'
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  try {
    supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  } catch {}
}

app.post('/api/upload-photo', async (req, res) => {
  try {
    const { imageDataUrl, fileName } = req.body || {}
    if (!imageDataUrl) {
      return res.status(400).json({ error: 'imageDataUrl is required' })
    }

    const mimeMatch = String(imageDataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg'
    if (!mimeMatch) {
      // still proceed but warn
      console.warn('Upload warning: imageDataUrl has no explicit image mime, defaulting to image/jpeg')
    }

    const now = new Date()
    const defaultName = `checkup-${now
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19)}.jpg`
    const name = (fileName || '').trim() || defaultName

    const base64 = String(imageDataUrl).split(',')[1]
    if (!base64) {
      return res.status(400).json({ error: 'Invalid imageDataUrl format' })
    }
    const buffer = Buffer.from(base64, 'base64')

    if (supabaseAdmin) {
      try {
        const path = `${name}`
        const { data: upRes, error: upErr } = await supabaseAdmin.storage
          .from(SUPABASE_BUCKET)
          .upload(path, buffer, { contentType: mimeType, upsert: true })
        if (upErr) throw upErr
        const { data: pub } = supabaseAdmin.storage
          .from(SUPABASE_BUCKET)
          .getPublicUrl(path)
        return res.json({ id: upRes?.path || path, name, webViewLink: pub?.publicUrl || null })
      } catch (supErr) {
        return res.status(500).json({
          error: 'Upload failed',
          details: { message: supErr?.message || 'Supabase upload failed' },
        })
      }
    }

    return res.status(500).json({ error: 'Upload failed', details: { message: 'Supabase not configured' } })
  } catch (err) {
    console.error('Upload to Drive error', {
      message: err?.message,
      code: err?.code,
      errors: err?.errors,
      stack: err?.stack,
    })
    return res.status(500).json({
      error: 'Upload failed',
      details: { message: err?.message, code: err?.code, errors: err?.errors },
    })
  }
})

const port = process.env.PORT || 5175
app.listen(port, () => {
  console.log(`Photo upload server running on http://localhost:${port}`)
})
