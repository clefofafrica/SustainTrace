 
;; SustainTrace Supply Token Contract
;; Clarity v2
;; Implements SIP-010 compliant fungible token with minting, burning, transfers, approvals,
;; staking for governance, reward emissions, and admin controls.
;; Designed for rewarding sustainable practices in agriculture supply chains.

(use-trait ft-trait .sip-010-trait.ft-trait) ;; Assuming SIP-010 trait is defined elsewhere or standard.

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INSUFFICIENT-BALANCE u101)
(define-constant ERR-INSUFFICIENT-STAKE u102)
(define-constant ERR-MAX-SUPPLY-REACHED u103)
(define-constant ERR-PAUSED u104)
(define-constant ERR-ZERO-ADDRESS u105)
(define-constant ERR-INVALID-AMOUNT u106)
(define-constant ERR-ALREADY-APPROVED u107)
(define-constant ERR-INSUFFICIENT-ALLOWANCE u108)
(define-constant ERR-STAKING-LOCKED u109)
(define-constant ERR-REWARD-CLAIM-FAILED u110)

;; Token metadata
(define-constant TOKEN-NAME "SustainTrace Token")
(define-constant TOKEN-SYMBOL "SUST")
(define-constant TOKEN-DECIMALS u6)
(define-constant MAX-SUPPLY u100000000000000) ;; 100M tokens with 6 decimals
(define-constant REWARD-RATE u100) ;; Example reward rate per block for stakers (adjustable)

;; Admin and contract state
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var total-supply uint u0)
(define-data-var last-reward-block uint block-height)

;; Balances, allowances, stakes, and rewards
(define-map balances principal uint)
(define-map allowances { owner: principal, spender: principal } uint)
(define-map staked-balances principal uint)
(define-map staking-start-block principal uint)
(define-map accumulated-rewards principal uint)

;; Private helper: is-admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin)))

;; Private helper: ensure not paused
(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED)))

;; Private helper: calculate rewards for a staker
(define-private (calculate-rewards (account principal))
  (let (
    (staked (default-to u0 (map-get? staked-balances account)))
    (start-block (default-to u0 (map-get? staking-start-block account)))
    (current-block block-height)
    (blocks-staked (if (> current-block start-block) (- current-block start-block) u0))
    (rewards (* staked (* REWARD-RATE blocks-staked)))
  )
    rewards))

;; Update rewards for a staker
(define-private (update-rewards (account principal))
  (let ((new-rewards (calculate-rewards account)))
    (map-set accumulated-rewards account (+ (default-to u0 (map-get? accumulated-rewards account)) new-rewards))
    (map-set staking-start-block account block-height)
    (ok true)))

;; Transfer admin rights
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-admin tx-sender)) (err ERR-ZERO-ADDRESS)) ;; Prevent self-zero
    (var-set admin new-admin)
    (print { event: "admin-transfer", new-admin: new-admin })
    (ok true)))

;; Pause/unpause the contract
(define-public (set-paused (pause bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set paused pause)
    (print { event: "pause-set", paused: pause })
    (ok pause)))

;; Mint new tokens (admin only)
(define-public (mint (recipient principal) (amount uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (asserts! (not (is-eq recipient tx-sender)) (err ERR-ZERO-ADDRESS))
    (let ((new-supply (+ (var-get total-supply) amount)))
      (asserts! (<= new-supply MAX-SUPPLY) (err ERR-MAX-SUPPLY-REACHED))
      (map-set balances recipient (+ amount (default-to u0 (map-get? balances recipient))))
      (var-set total-supply new-supply)
      (print { event: "mint", recipient: recipient, amount: amount })
      (ok true))))

;; Burn tokens
(define-public (burn (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (let ((balance (default-to u0 (map-get? balances tx-sender))))
      (asserts! (>= balance amount) (err ERR-INSUFFICIENT-BALANCE))
      (map-set balances tx-sender (- balance amount))
      (var-set total-supply (- (var-get total-supply) amount))
      (print { event: "burn", burner: tx-sender, amount: amount })
      (ok true))))

;; Transfer tokens
(define-public (transfer (recipient principal) (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (asserts! (not (is-eq recipient tx-sender)) (err ERR-ZERO-ADDRESS))
    (let ((sender-balance (default-to u0 (map-get? balances tx-sender))))
      (asserts! (>= sender-balance amount) (err ERR-INSUFFICIENT-BALANCE))
      (map-set balances tx-sender (- sender-balance amount))
      (map-set balances recipient (+ amount (default-to u0 (map-get? balances recipient))))
      (print { event: "transfer", from: tx-sender, to: recipient, amount: amount })
      (ok true))))

;; Approve spender
(define-public (approve (spender principal) (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (not (is-eq spender tx-sender)) (err ERR-ZERO-ADDRESS))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (let ((key { owner: tx-sender, spender: spender }))
      (asserts! (is-none (map-get? allowances key)) (err ERR-ALREADY-APPROVED))
      (map-set allowances key amount)
      (print { event: "approve", owner: tx-sender, spender: spender, amount: amount })
      (ok true))))

;; Transfer from (using allowance)
(define-public (transfer-from (owner principal) (recipient principal) (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (let (
      (key { owner: owner, spender: tx-sender })
      (allowance (default-to u0 (map-get? allowances key)))
      (owner-balance (default-to u0 (map-get? balances owner)))
    )
      (asserts! (>= allowance amount) (err ERR-INSUFFICIENT-ALLOWANCE))
      (asserts! (>= owner-balance amount) (err ERR-INSUFFICIENT-BALANCE))
      (map-set allowances key (- allowance amount))
      (map-set balances owner (- owner-balance amount))
      (map-set balances recipient (+ amount (default-to u0 (map-get? balances recipient))))
      (print { event: "transfer-from", from: owner, to: recipient, amount: amount, spender: tx-sender })
      (ok true))))

;; Stake tokens for governance and rewards
(define-public (stake (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (let ((balance (default-to u0 (map-get? balances tx-sender))))
      (asserts! (>= balance amount) (err ERR-INSUFFICIENT-BALANCE))
      (try! (update-rewards tx-sender)) ;; Accumulate rewards before staking more
      (map-set balances tx-sender (- balance amount))
      (map-set staked-balances tx-sender (+ amount (default-to u0 (map-get? staked-balances tx-sender))))
      (if (is-none (map-get? staking-start-block tx-sender))
        (map-set staking-start-block tx-sender block-height)
        false)
      (print { event: "stake", staker: tx-sender, amount: amount })
      (ok true))))

;; Unstake tokens
(define-public (unstake (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (let ((stake-balance (default-to u0 (map-get? staked-balances tx-sender))))
      (asserts! (>= stake-balance amount) (err ERR-INSUFFICIENT-STAKE))
      (try! (update-rewards tx-sender)) ;; Accumulate before unstaking
      (map-set staked-balances tx-sender (- stake-balance amount))
      (map-set balances tx-sender (+ amount (default-to u0 (map-get? balances tx-sender))))
      (print { event: "unstake", staker: tx-sender, amount: amount })
      (ok true))))

;; Claim accumulated rewards
(define-public (claim-rewards)
  (begin
    (ensure-not-paused)
    (try! (update-rewards tx-sender))
    (let ((rewards (default-to u0 (map-get? accumulated-rewards tx-sender))))
      (asserts! (> rewards u0) (err ERR-REWARD-CLAIM-FAILED))
      (map-set accumulated-rewards tx-sender u0)
      (map-set balances tx-sender (+ rewards (default-to u0 (map-get? balances tx-sender))))
      (var-set total-supply (+ (var-get total-supply) rewards)) ;; Rewards are minted
      (print { event: "claim-rewards", claimant: tx-sender, amount: rewards })
      (ok rewards))))

;; Read-only: get balance
(define-read-only (get-balance (account principal))
  (default-to u0 (map-get? balances account)))

;; Read-only: get allowance
(define-read-only (get-allowance (owner principal) (spender principal))
  (default-to u0 (map-get? allowances { owner: owner, spender: spender })))

;; Read-only: get staked balance
(define-read-only (get-staked-balance (account principal))
  (default-to u0 (map-get? staked-balances account)))

;; Read-only: get accumulated rewards
(define-read-only (get-accumulated-rewards (account principal))
  (+ (default-to u0 (map-get? accumulated-rewards account)) (calculate-rewards account)))

;; Read-only: get total supply
(define-read-only (get-total-supply)
  (var-get total-supply))

;; Read-only: get admin
(define-read-only (get-admin)
  (var-get admin))

;; Read-only: check if paused
(define-read-only (is-paused)
  (var-get paused))

;; Read-only: get token name
(define-read-only (get-name)
  TOKEN-NAME)

;; Read-only: get token symbol
(define-read-only (get-symbol)
  TOKEN-SYMBOL)

;; Read-only: get token decimals
(define-read-only (get-decimals)
  TOKEN-DECIMALS)

;; SIP-010 compliance: transfer (already defined, but for trait)
(define-public (transfer-sip010 (recipient principal) (amount uint) (memo (optional (buff 34))))
  (transfer recipient amount))

;; Additional: batch mint (admin only)
(define-public (batch-mint (recipients (list 100 { recipient: principal, amount: uint })))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (fold batch-mint-iter recipients (ok u0))))

(define-private (batch-mint-iter (entry { recipient: principal, amount: uint }) (prev (response uint uint)))
  (match prev
    total (begin
      (try! (mint (get recipient entry) (get amount entry)))
      (ok (+ total (get amount entry))))
    error (err error)))

