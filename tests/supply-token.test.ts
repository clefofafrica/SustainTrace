// tests/supply-token.test.ts
import { describe, it, expect, beforeEach } from "vitest";

interface MockContract {
	admin: string;
	paused: boolean;
	totalSupply: bigint;
	balances: Map<string, bigint>;
	allowances: Map<string, bigint>; // Key as `${owner}:${spender}`
	stakedBalances: Map<string, bigint>;
	stakingStartBlock: Map<string, bigint>;
	accumulatedRewards: Map<string, bigint>;
	lastRewardBlock: bigint;
	MAX_SUPPLY: bigint;
	REWARD_RATE: bigint;

	isAdmin(caller: string): boolean;
	setPaused(
		caller: string,
		pause: boolean
	): { value: boolean } | { error: number };
	mint(
		caller: string,
		recipient: string,
		amount: bigint
	): { value: true } | { error: number };
	burn(caller: string, amount: bigint): { value: true } | { error: number };
	transfer(
		caller: string,
		recipient: string,
		amount: bigint
	): { value: true } | { error: number };
	approve(
		caller: string,
		spender: string,
		amount: bigint
	): { value: true } | { error: number };
	transferFrom(
		caller: string,
		owner: string,
		recipient: string,
		amount: bigint
	): { value: true } | { error: number };
	stake(caller: string, amount: bigint): { value: true } | { error: number };
	unstake(caller: string, amount: bigint): { value: true } | { error: number };
	claimRewards(
		caller: string,
		currentBlock: bigint
	): { value: bigint } | { error: number };
	getBalance(account: string): bigint;
	getAllowance(owner: string, spender: string): bigint;
	getStakedBalance(account: string): bigint;
	getAccumulatedRewards(account: string, currentBlock: bigint): bigint;
}

const mockContract: MockContract = {
	admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
	paused: false,
	totalSupply: 0n,
	balances: new Map(),
	allowances: new Map(),
	stakedBalances: new Map(),
	stakingStartBlock: new Map(),
	accumulatedRewards: new Map(),
	lastRewardBlock: 0n,
	MAX_SUPPLY: 100_000_000_000_000n,
	REWARD_RATE: 100n,

	isAdmin(caller: string) {
		return caller === this.admin;
	},

	setPaused(caller: string, pause: boolean) {
		if (!this.isAdmin(caller)) return { error: 100 };
		this.paused = pause;
		return { value: pause };
	},

	mint(caller: string, recipient: string, amount: bigint) {
		if (!this.isAdmin(caller)) return { error: 100 };
		if (amount <= 0n) return { error: 106 };
		if (this.totalSupply + amount > this.MAX_SUPPLY) return { error: 103 };
		this.balances.set(recipient, (this.balances.get(recipient) ?? 0n) + amount);
		this.totalSupply += amount;
		return { value: true };
	},

	burn(caller: string, amount: bigint) {
		if (this.paused) return { error: 104 };
		if (amount <= 0n) return { error: 106 };
		const bal = this.balances.get(caller) ?? 0n;
		if (bal < amount) return { error: 101 };
		this.balances.set(caller, bal - amount);
		this.totalSupply -= amount;
		return { value: true };
	},

	transfer(caller: string, recipient: string, amount: bigint) {
		if (this.paused) return { error: 104 };
		if (amount <= 0n) return { error: 106 };
		const bal = this.balances.get(caller) ?? 0n;
		if (bal < amount) return { error: 101 };
		this.balances.set(caller, bal - amount);
		this.balances.set(recipient, (this.balances.get(recipient) ?? 0n) + amount);
		return { value: true };
	},

	approve(caller: string, spender: string, amount: bigint) {
		if (this.paused) return { error: 104 };
		if (amount <= 0n) return { error: 106 };
		const key = `${caller}:${spender}`;
		if (this.allowances.has(key)) return { error: 107 };
		this.allowances.set(key, amount);
		return { value: true };
	},

	transferFrom(
		caller: string,
		owner: string,
		recipient: string,
		amount: bigint
	) {
		if (this.paused) return { error: 104 };
		if (amount <= 0n) return { error: 106 };
		const key = `${owner}:${caller}`;
		const allowance = this.allowances.get(key) ?? 0n;
		if (allowance < amount) return { error: 108 };
		const ownerBal = this.balances.get(owner) ?? 0n;
		if (ownerBal < amount) return { error: 101 };
		this.allowances.set(key, allowance - amount);
		this.balances.set(owner, ownerBal - amount);
		this.balances.set(recipient, (this.balances.get(recipient) ?? 0n) + amount);
		return { value: true };
	},

	stake(caller: string, amount: bigint) {
		if (this.paused) return { error: 104 };
		if (amount <= 0n) return { error: 106 };
		const bal = this.balances.get(caller) ?? 0n;
		if (bal < amount) return { error: 101 };
		// Simulate update rewards
		const currentRewards = this.getAccumulatedRewards(caller, 100n); // Mock block
		this.accumulatedRewards.set(caller, currentRewards);
		this.stakingStartBlock.set(caller, 100n); // Mock
		this.balances.set(caller, bal - amount);
		this.stakedBalances.set(
			caller,
			(this.stakedBalances.get(caller) ?? 0n) + amount
		);
		return { value: true };
	},

	unstake(caller: string, amount: bigint) {
		if (this.paused) return { error: 104 };
		if (amount <= 0n) return { error: 106 };
		const stakeBal = this.stakedBalances.get(caller) ?? 0n;
		if (stakeBal < amount) return { error: 102 };
		// Simulate update rewards
		const currentRewards = this.getAccumulatedRewards(caller, 100n);
		this.accumulatedRewards.set(caller, currentRewards);
		this.stakedBalances.set(caller, stakeBal - amount);
		this.balances.set(caller, (this.balances.get(caller) ?? 0n) + amount);
		return { value: true };
	},

	claimRewards(caller: string, currentBlock: bigint) {
		if (this.paused) return { error: 104 };
		// Update
		const rewards = this.getAccumulatedRewards(caller, currentBlock);
		if (rewards <= 0n) return { error: 110 };
		this.accumulatedRewards.set(caller, 0n);
		this.balances.set(caller, (this.balances.get(caller) ?? 0n) + rewards);
		this.totalSupply += rewards;
		return { value: rewards };
	},

	getBalance(account: string): bigint {
		return this.balances.get(account) ?? 0n;
	},

	getAllowance(owner: string, spender: string): bigint {
		return this.allowances.get(`${owner}:${spender}`) ?? 0n;
	},

	getStakedBalance(account: string): bigint {
		return this.stakedBalances.get(account) ?? 0n;
	},

	getAccumulatedRewards(account: string, currentBlock: bigint): bigint {
		const staked = this.stakedBalances.get(account) ?? 0n;
		const startBlock = this.stakingStartBlock.get(account) ?? 0n;
		const blocks = currentBlock > startBlock ? currentBlock - startBlock : 0n;
		const newRewards = staked * this.REWARD_RATE * blocks;
		return (this.accumulatedRewards.get(account) ?? 0n) + newRewards;
	},
};

describe("SustainTrace Supply Token Contract", () => {
	beforeEach(() => {
		mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
		mockContract.paused = false;
		mockContract.totalSupply = 0n;
		mockContract.balances = new Map();
		mockContract.allowances = new Map();
		mockContract.stakedBalances = new Map();
		mockContract.stakingStartBlock = new Map();
		mockContract.accumulatedRewards = new Map();
		mockContract.lastRewardBlock = 0n;
	});

	it("should allow admin to mint tokens", () => {
		const result = mockContract.mint(
			mockContract.admin,
			"ST2CY5V39NHDPWSXMW9QDT3tIPnYm3u1n0m00JAx",
			1000n
		);
		expect(result).toEqual({ value: true });
		expect(
			mockContract.getBalance("ST2CY5V39NHDPWSXMW9QDT3tIPnYm3u1n0m00JAx")
		).toBe(1000n);
		expect(mockContract.totalSupply).toBe(1000n);
	});

	it("should prevent non-admin from minting", () => {
		const result = mockContract.mint(
			"ST2CY5V39NHDPWSXMW9QDT3tIPnYm3u1n0m00JAx",
			"ST3NBRSFKX28FQ2z2L2VF0YH2DYBAY1D9HNA6NG7",
			1000n
		);
		expect(result).toEqual({ error: 100 });
	});

	it("should prevent minting over max supply", () => {
		const result = mockContract.mint(
			mockContract.admin,
			"ST2CY5V39NHDPWSXMW9QDT3tIPnYm3u1n0m00JAx",
			200_000_000_000_000n
		);
		expect(result).toEqual({ error: 103 });
	});

	it("should allow burning tokens", () => {
		mockContract.mint(
			mockContract.admin,
			"ST2CY5V39NHDPWSXMW9QDT3tIPnYm3u1n0m00JAx",
			500n
		);
		const result = mockContract.burn(
			"ST2CY5V39NHDPWSXMW9QDT3tIPnYm3u1n0m00JAx",
			200n
		);
		expect(result).toEqual({ value: true });
		expect(
			mockContract.getBalance("ST2CY5V39NHDPWSXMW9QDT3tIPnYm3u1n0m00JAx")
		).toBe(300n);
		expect(mockContract.totalSupply).toBe(300n);
	});

	it("should allow transfers", () => {
		mockContract.mint(
			mockContract.admin,
			"ST2CY5V39NHDPWSXMW9QDT3tIPnYm3u1n0m00JAx",
			500n
		);
		const result = mockContract.transfer(
			"ST2CY5V39NHDPWSXMW9QDT3tIPnYm3u1n0m00JAx",
			"ST3NBRSFKX28FQ2z2L2VF0YH2DYBAY1D9HNA6NG7",
			200n
		);
		expect(result).toEqual({ value: true });
		expect(
			mockContract.getBalance("ST2CY5V39NHDPWSXMW9QDT3tIPnYm3u1n0m00JAx")
		).toBe(300n);
		expect(
			mockContract.getBalance("ST3NBRSFKX28FQ2z2L2VF0YH2DYBAY1D9HNA6NG7")
		).toBe(200n);
	});

	it("should allow approvals and transfer-from", () => {
		mockContract.mint(
			mockContract.admin,
			"ST2CY5V39NHDPWSXMW9QDT3tIPnYm3u1n0m00JAx",
			500n
		);
		const approveResult = mockContract.approve(
			"ST2CY5V39NHDPWSXMW9QDT3tIPnYm3u1n0m00JAx",
			"ST3NBRSFKX28FQ2z2L2VF0YH2DYBAY1D9HNA6NG7",
			300n
		);
		expect(approveResult).toEqual({ value: true });
		expect(
			mockContract.getAllowance(
				"ST2CY5V39NHDPWSXMW9QDT3tIPnYm3u1n0m00JAx",
				"ST3NBRSFKX28FQ2z2L2VF0YH2DYBAY1D9HNA6NG7"
			)
		).toBe(300n);

		const transferFromResult = mockContract.transferFrom(
			"ST3NBRSFKX28FQ2z2L2VF0YH2DYBAY1D9HNA6NG7",
			"ST2CY5V39NHDPWSXMW9QDT3tIPnYm3u1n0m00JAx",
			"ST4ABCDEF...",
			200n
		);
		expect(transferFromResult).toEqual({ value: true });
		expect(
			mockContract.getBalance("ST2CY5V39NHDPWSXMW9QDT3tIPnYm3u1n0m00JAx")
		).toBe(300n);
		expect(mockContract.getBalance("ST4ABCDEF...")).toBe(200n);
		expect(
			mockContract.getAllowance(
				"ST2CY5V39NHDPWSXMW9QDT3tIPnYm3u1n0m00JAx",
				"ST3NBRSFKX28FQ2z2L2VF0YH2DYBAY1D9HNA6NG7"
			)
		).toBe(100n);
	});

	it("should allow staking and unstaking", () => {
		mockContract.mint(
			mockContract.admin,
			"ST2CY5V39NHDPWSXMW9QDT3tIPnYm3u1n0m00JAx",
			500n
		);
		const stakeResult = mockContract.stake(
			"ST2CY5V39NHDPWSXMW9QDT3tIPnYm3u1n0m00JAx",
			200n
		);
		expect(stakeResult).toEqual({ value: true });
		expect(
			mockContract.getBalance("ST2CY5V39NHDPWSXMW9QDT3tIPnYm3u1n0m00JAx")
		).toBe(300n);
		expect(
			mockContract.getStakedBalance("ST2CY5V39NHDPWSXMW9QDT3tIPnYm3u1n0m00JAx")
		).toBe(200n);

		const unstakeResult = mockContract.unstake(
			"ST2CY5V39NHDPWSXMW9QDT3tIPnYm3u1n0m00JAx",
			100n
		);
		expect(unstakeResult).toEqual({ value: true });
		expect(
			mockContract.getStakedBalance("ST2CY5V39NHDPWSXMW9QDT3tIPnYm3u1n0m00JAx")
		).toBe(100n);
		expect(
			mockContract.getBalance("ST2CY5V39NHDPWSXMW9QDT3tIPnYm3u1n0m00JAx")
		).toBe(400n);
	});

	it("should not allow actions when paused", () => {
		mockContract.setPaused(mockContract.admin, true);
		const transferResult = mockContract.transfer(
			"ST2CY5V39NHDPWSXMW9QDT3tIPnYm3u1n0m00JAx",
			"ST3NBRSFKX28FQ2z2L2VF0YH2DYBAY1D9HNA6NG7",
			10n
		);
		expect(transferResult).toEqual({ error: 104 });

		const stakeResult = mockContract.stake(
			"ST2CY5V39NHDPWSXMW9QDT3tIPnYm3u1n0m00JAx",
			10n
		);
		expect(stakeResult).toEqual({ error: 104 });
	});
});
