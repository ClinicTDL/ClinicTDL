import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'patient-photos'

// Initialize Supabase Client
let supabaseAdmin = null
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  try {
    supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  } catch (e) {
    console.error('Supabase init failed:', e)
  }
}

export default async function handler(req, res) {
  // CORS Handling (Optional, Vercel handles this usually but good to have)
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  )

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    const { imageDataUrl, fileName } = req.body || {}
    if (!imageDataUrl) {
      return res.status(400).json({ error: 'imageDataUrl is required' })
    }

    // MIME type handling
    const mimeMatch = String(imageDataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg'
    
    // Generate filename
    const now = new Date()
    const defaultName = `checkup-${now
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19)}.jpg`
    const name = (fileName || '').trim() || defaultName

    // Convert Base64 to Buffer
    const base64 = String(imageDataUrl).split(',')[1]
    if (!base64) {
      return res.status(400).json({ error: 'Invalid imageDataUrl format' })
    }
    const buffer = Buffer.from(base64, 'base64')

    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Server configuration error: Supabase not connected' })
    }

    // Upload to Supabase
    const path = `${name}`
    const { data: upRes, error: upErr } = await supabaseAdmin.storage
      .from(SUPABASE_BUCKET)
      .upload(path, buffer, { contentType: mimeType, upsert: true })

    if (upErr) throw upErr

    // Get Public URL
    const { data: pub } = supabaseAdmin.storage
      .from(SUPABASE_BUCKET)
      .getPublicUrl(path)

    return res.status(200).json({ 
      id: upRes?.path || path, 
      name, 
      webViewLink: pub?.publicUrl || null 
    })

  } catch (err) {
    console.error('Upload error:', err)
    return res.status(500).json({
      error: 'Upload failed',
      details: { message: err?.message || 'Unknown error' },
    })
  }
}
