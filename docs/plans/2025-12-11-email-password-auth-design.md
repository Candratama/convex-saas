# Email + Password Authentication Design

> **Status:** Approved
> **Date:** 2025-12-11

## Overview

Mengganti OTP-based login dengan Email + Password authentication. GitHub OAuth dihapus.

### Goals
- Login dengan email + password
- Registrasi dengan email verification (inline)
- Forgot password dengan code via email
- Remember me untuk session lebih lama

---

## User Flows

### Flow Registrasi (`/register`)
```
1. User masukkan email
2. Klik "Register"
3. Backend kirim 8-digit code ke email
4. User masukkan code + password baru (di halaman yang sama, form berubah)
5. Validasi password (min 8 char, uppercase, lowercase, angka)
6. Submit → Account created + auto login
```

### Flow Login (`/login`)
```
1. User masukkan email + password
2. Checkbox "Remember me" (optional)
3. Klik "Login"
4. Jika valid → redirect ke dashboard
5. Link ke "/register" dan "Forgot password?"
```

### Flow Forgot Password (`/forgot-password`)
```
1. User masukkan email
2. Klik "Send Reset Code"
3. Backend kirim 8-digit code ke email
4. User masukkan code + password baru
5. Validasi password
6. Submit → Password updated + auto login
```

### Session Duration
- **Tanpa "Remember me"**: 24 jam
- **Dengan "Remember me"**: 30 hari

---

## Technical Architecture

### Backend Changes (Convex)

**1. Auth Provider**
- Hapus: ResendOTP, GitHub OAuth
- Tambah: Password provider dari @convex-dev/auth

**2. Schema Update** - Tambah field di `users` table:
```typescript
users: defineTable({
  // ... existing fields
  passwordHash: v.optional(v.string()),    // Hashed password
  emailVerified: v.optional(v.boolean()),  // Email verification status
})
```

**3. Email Templates**
- `VerificationCodeEmail.tsx` - Update untuk register
- `PasswordResetEmail.tsx` - Baru, untuk forgot password

**4. Auth Configuration**
```typescript
// convex/auth.ts
export const { auth, signIn, signOut, store } = convexAuth({
  providers: [
    Password({
      id: "password",
      // Custom verify & hash functions
      // Session duration config (24h vs 30 days)
    }),
  ],
});
```

### Password Hashing
- Menggunakan Argon2 (`@node-rs/argon2`)
- Salt otomatis di-generate per password

---

## Frontend Pages & Components

### Route Structure
```
src/routes/_app/
├── login/
│   └── _layout.index.tsx      # Login page (update)
├── register/
│   └── _layout.index.tsx      # Register page (baru)
└── forgot-password/
    └── _layout.index.tsx      # Forgot password page (baru)
```

### Login Page (`/login`)
```
┌─────────────────────────────────┐
│         Login                   │
├─────────────────────────────────┤
│  Email: [________________]      │
│  Password: [________________]   │
│  ☐ Remember me                  │
│                                 │
│  [        Login        ]        │
│  Forgot password?               │
│  Don't have account? Register   │
└─────────────────────────────────┘
```

### Register Page (`/register`)

**Step 1: Email**
```
┌─────────────────────────────────┐
│         Create Account          │
├─────────────────────────────────┤
│  Email: [________________]      │
│  [    Send Verification   ]     │
│  Already have account? Login    │
└─────────────────────────────────┘
```

**Step 2: Code + Password**
```
┌─────────────────────────────────┐
│         Verify & Set Password   │
├─────────────────────────────────┤
│  Code sent to user@email.com    │
│  Code: [________________]       │
│  Password: [________________]   │
│  Confirm: [________________]    │
│  [    Create Account    ]       │
└─────────────────────────────────┘
```

### Forgot Password Page (`/forgot-password`)
Sama seperti register: 2 step (email → code + new password)

---

## Validation & Error Handling

### Password Validation
```
✓ Minimal 8 karakter
✓ Minimal 1 huruf besar (A-Z)
✓ Minimal 1 huruf kecil (a-z)
✓ Minimal 1 angka (0-9)
```

### Error Messages

| Scenario | Message |
|----------|---------|
| Email tidak terdaftar (login) | "Email atau password salah" |
| Password salah (login) | "Email atau password salah" |
| Email sudah terdaftar (register) | "Email sudah terdaftar. Silakan login" |
| Code expired/invalid | "Kode tidak valid atau sudah expired" |
| Password tidak match | "Password tidak sama" |

### Rate Limiting
- **Login**: Max 5 attempts per email per 15 menit
- **Send code**: Max 3 requests per email per 15 menit
- **Forgot password**: Max 3 requests per email per jam

### Security
- Password di-hash dengan Argon2 sebelum disimpan
- Code verification expires dalam 20 menit
- Tidak expose apakah email terdaftar saat login (prevent enumeration)

---

## File Changes

### Files to Create
```
convex/
├── password/
│   └── PasswordAuth.ts          # Password provider config
├── email/
│   └── PasswordResetEmail.tsx   # Reset password email template

src/routes/_app/
├── register/
│   └── _layout.index.tsx        # Register page
└── forgot-password/
    └── _layout.index.tsx        # Forgot password page
```

### Files to Modify
```
convex/
├── auth.ts                      # Ganti providers
├── schema.ts                    # Tambah passwordHash, emailVerified
├── otp/
│   └── VerificationCodeEmail.tsx # Update template

src/routes/_app/
└── login/
    └── _layout.index.tsx        # Update login form
```

### Files to Delete
```
convex/
└── otp/
    └── ResendOTP.ts             # Diganti Password provider
```

### Dependencies
```bash
npm install @node-rs/argon2      # Password hashing
```

---

## Implementation Notes

1. Gunakan `@convex-dev/auth` Password provider
2. Argon2 untuk password hashing
3. Resend untuk email delivery (existing)
4. TanStack Form untuk form handling (existing)
