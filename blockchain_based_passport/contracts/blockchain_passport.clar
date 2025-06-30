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

;; Read-only functions
(define-read-only (get-passport (passport-id (string-utf8 32)))
    (map-get? Passports {passport-id: passport-id})
)

(define-read-only (get-holder-passport (holder principal))
    (map-get? HolderPassports holder)
)

(define-read-only (is-valid-passport? (passport-id (string-utf8 32)))
    (match (map-get? Passports {passport-id: passport-id})
        passport (and 
            (get is-valid passport)
            (> (get expiry-date passport) block-height)
        )
        false
    )
)

(define-read-only (is-authority (address principal))
    (match (map-get? PassportAuthorities address)
        authority (get active authority)
        false
    )
)

;; Public functions

(define-public (add-authority (authority-address principal) (authority-name (string-utf8 100)))
    (begin
        (asserts! (is-eq tx-sender contract-owner) err-unauthorized)
        (asserts! (is-none (map-get? PassportAuthorities authority-address)) err-already-exists)
        
        (map-set PassportAuthorities
            authority-address
            {
                name: authority-name,
                active: true,
                authorized-since: block-height
            }
        )
        (ok true)
    )
)

(define-public (remove-authority (authority-address principal))
    (begin
        (asserts! (is-eq tx-sender contract-owner) err-unauthorized)
        (asserts! (is-some (map-get? PassportAuthorities authority-address)) err-not-found)
        
        (map-set PassportAuthorities
            authority-address
            {
                name: (get name (unwrap-panic (map-get? PassportAuthorities authority-address))),
                active: false,
                authorized-since: (get authorized-since (unwrap-panic (map-get? PassportAuthorities authority-address)))
            }
        )
        (ok true)
    )
)

(define-public (issue-passport 
    (passport-id (string-utf8 32))
    (holder principal)
    (full-name (string-utf8 100))
    (date-of-birth uint)
    (nationality (string-utf8 50))
    (validity-period uint)
    (metadata-url (optional (string-utf8 256)))
)
    (begin
        ;; Check authorization and validations
        (asserts! (is-authority tx-sender) err-unauthorized)
        (asserts! (is-none (map-get? PassportNumbers passport-id)) err-already-exists)
        (asserts! (is-none (map-get? HolderPassports holder)) err-already-exists)
        
        ;; Set passport data
        (map-set Passports
            {passport-id: passport-id}
            {
                holder: holder,
                full-name: full-name,
                date-of-birth: date-of-birth,
                nationality: nationality,
                issue-date: block-height,
                expiry-date: (+ block-height validity-period),
                is-valid: true,
                metadata-url: metadata-url
            }
        )
        
        ;; Set additional mappings
        (map-set PassportNumbers passport-id true)
        (map-set HolderPassports holder passport-id)
        
        (ok true)
    )
)

(define-public (revoke-passport (passport-id (string-utf8 32)))
    (begin
        (asserts! (is-authority tx-sender) err-unauthorized)
        (asserts! (is-some (map-get? Passports {passport-id: passport-id})) err-not-found)
        
        (let (
            (passport (unwrap-panic (map-get? Passports {passport-id: passport-id})))
        )
            (map-set Passports
                {passport-id: passport-id}
                (merge passport {is-valid: false})
            )
        )
        
        (ok true)
    )
)

(define-public (update-passport-metadata 
    (passport-id (string-utf8 32))
    (metadata-url (optional (string-utf8 256)))
)
    (begin
        (asserts! (is-authority tx-sender) err-unauthorized)
        (asserts! (is-some (map-get? Passports {passport-id: passport-id})) err-not-found)
        
        (let (
            (passport (unwrap-panic (map-get? Passports {passport-id: passport-id})))
        )
            (map-set Passports
                {passport-id: passport-id}
                (merge passport {metadata-url: metadata-url})
            )
        )
        
        (ok true)
    )
)

(define-public (extend-passport-validity 
    (passport-id (string-utf8 32))
    (extension-period uint)
)
    (begin
        (asserts! (is-authority tx-sender) err-unauthorized)
        (asserts! (is-some (map-get? Passports {passport-id: passport-id})) err-not-found)
        
        (let (
            (passport (unwrap-panic (map-get? Passports {passport-id: passport-id})))
            (new-expiry (+ (get expiry-date passport) extension-period))
        )
            (map-set Passports
                {passport-id: passport-id}
                (merge passport {expiry-date: new-expiry})
            )
        )
        
        (ok true)
    )
)