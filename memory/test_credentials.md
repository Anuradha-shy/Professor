# Access

- App password (PIN gate): `ican` (alphanumeric, 4–32 letters/digits; change in Settings → Vault & data)
- Device binding: the FIRST device to unlock becomes the trusted device; later devices need approval
  from Settings → Devices. Device registry was cleared after testing, so the owner's Redmi Pad SE
  becomes the trusted device on its next unlock.
- Reset device binding (if locked out): clear the `devices` collection in Mongo.
