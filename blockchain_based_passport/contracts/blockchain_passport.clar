;; Digital Passport System

(define-constant contract-owner tx-sender)
(define-constant err-unauthorized (err u1))
(define-constant err-invalid-input (err u2))
(define-constant err-already-exists (err u3))
(define-constant err-not-found (err u4))
(define-constant err-invalid (err u5))
(define-constant err-operation-failed (err u6))

;; Data Maps
(define-map Passports
    {passport-id: (string-utf8 32)}
    {
        holder: principal,
        full-name: (string-utf8 100),
        date-of-birth: uint,
        nationality: (string-utf8 50),
        issue-date: uint,
        expiry-date: uint,
        is-valid: bool,
        metadata-url: (optional (string-utf8 256))
    }
)

(define-map PassportAuthorities
    principal
    {
        name: (string-utf8 100),
        active: bool,
        authorized-since: uint
    }
)

(define-map HolderPassports
    principal
    (string-utf8 32)
)

;; Storage of passport numbers to prevent duplicates
(define-map PassportNumbers
    (string-utf8 32)
    bool
)