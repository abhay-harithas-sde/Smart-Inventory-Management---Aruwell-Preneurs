# ATH ERP Demo Credentials

## Demo Retail Tenant (seeded on backend startup)
- **Owner**: `owner@demo.ath` / `demo1234`
- **Cashier**: `cashier@demo.ath` / `demo1234`

## Integration Test Notes

### Razorpay (TEST MODE)
- Key ID: `rzp_test_TDGcWUlRvLdhSi`
- Test cards: 4111 1111 1111 1111 (any future expiry, any CVV)
- Test UPI: `success@razorpay` or `failure@razorpay`
- Flow: POS → add items → "Collect via Razorpay (UPI/Card)" → Checkout modal → complete → sale finalized

### Twilio
- Account SID: ACcc00d150b39d9012ff5fa218ff3f646b
- SMS from: +19208069591
- WhatsApp sandbox from: whatsapp:+14155238886
- IMPORTANT: To receive WhatsApp on a test number, the recipient must first send Twilio's join code to +14155238886

### ElevenLabs
- API key configured but account is FREE TIER
- Free tier blocks library voices via API — returns 402 with clear message
- Fix options: (a) upgrade Starter plan $5/mo, (b) clone voice in ElevenLabs Voice Lab and set ELEVENLABS_VOICE_ID

### Cloudinary
- Cloud: bnbg4qcl
- Uploads go to folder `ath-erp/<tenant_id>/products/`
- Backend signs; browser uploads directly to Cloudinary
