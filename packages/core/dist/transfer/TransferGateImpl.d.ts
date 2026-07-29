/**
 * Transfer Gate Implementation
 *
 * Implements gating logic for near/far transfer tests.
 * Skills can only be considered truly mastered when learners demonstrate
 * transfer to new contexts (near) and novel applications (far).
 *
 * Transfer Types:
 * - Near: Same skill, slightly different context
 * - Far: Same skill, significantly different domain/application
 *
 * DETERMINISM: All operations are pure and produce the same output
 * for the same input.
 */
import type { TransferGate, TransferTest, TransferTestResult } from '../constitution.js';
/**
 * Transfer gate configuration
 */
export interface TransferGateConfig {
    /** Require near transfer test before unlocking */
    requireNearTransfer: boolean;
    /** Require far transfer test before unlocking */
    requireFarTransfer: boolean;
    /** Grace period before requiring transfer tests (in events) */
    gracePeriodEvents: number;
}
/**
 * Default transfer gate configuration
 */
export declare const DEFAULT_TRANSFER_GATE_CONFIG: TransferGateConfig;
/**
 * Transfer Gate Implementation
 */
export declare class TransferGateImpl implements TransferGate {
    private readonly config;
    constructor(config?: Partial<TransferGateConfig>);
    /**
     * Check if a skill has passed required transfer tests
     *
     * @param skillId - Skill to check
     * @param testResults - All transfer test results for this learner
     * @param tests - All available transfer tests
     * @returns true if skill is unlocked (all required tests passed)
     */
    isSkillUnlocked(skillId: string, testResults: TransferTestResult[], tests: TransferTest[]): boolean;
    /**
     * Get required tests for a skill based on configuration
     *
     * @param skillId - Skill to get tests for
     * @param tests - All available transfer tests
     * @returns Array of required TransferTest objects
     */
    getRequiredTests(skillId: string, tests: TransferTest[]): TransferTest[];
    /**
     * Get pending (not yet passed) tests for a skill
     *
     * @param skillId - Skill to check
     * @param testResults - All transfer test results
     * @param tests - All available transfer tests
     * @returns Array of pending TransferTest objects
     */
    getPendingTests(skillId: string, testResults: TransferTestResult[], tests: TransferTest[]): TransferTest[];
    /**
     * Get next recommended transfer test for a skill
     *
     * Prioritizes near transfer before far transfer
     *
     * @param skillId - Skill to get test for
     * @param testResults - Existing test results
     * @param tests - All available tests
     * @returns Next recommended test or undefined
     */
    getNextTest(skillId: string, testResults: TransferTestResult[], tests: TransferTest[]): TransferTest | undefined;
    /**
     * Evaluate a transfer test attempt
     *
     * @param test - The test taken
     * @param score - Score achieved (0-1)
     * @param timestamp - When the test was taken
     * @returns TransferTestResult
     */
    evaluateAttempt(test: TransferTest, score: number, timestamp: number): TransferTestResult;
    /**
     * Get transfer test status for all skills
     *
     * @param testResults - All test results
     * @param tests - All available tests
     * @param skillIds - Skills to check
     * @returns Map of skillId to status
     */
    getTransferStatus(testResults: TransferTestResult[], tests: TransferTest[], skillIds: string[]): Map<string, TransferStatus>;
    /**
     * Create a transfer test specification
     */
    createTest(id: string, skillId: string, transferType: 'near' | 'far', context: string, passingScore?: number): TransferTest;
}
/**
 * Status of transfer tests for a skill
 */
export interface TransferStatus {
    skillId: string;
    isUnlocked: boolean;
    requiredTests: number;
    passedTests: number;
    pendingTests: number;
    attempts: number;
    lastAttempt?: number;
}
/**
 * Factory function to create a TransferGate
 */
export declare function createTransferGate(config?: Partial<TransferGateConfig>): TransferGateImpl;
//# sourceMappingURL=TransferGateImpl.d.ts.map