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
/**
 * Default transfer gate configuration
 */
export const DEFAULT_TRANSFER_GATE_CONFIG = {
    requireNearTransfer: true,
    requireFarTransfer: false, // Far transfer is optional by default
    gracePeriodEvents: 3,
};
/**
 * Transfer Gate Implementation
 */
export class TransferGateImpl {
    config;
    constructor(config = {}) {
        this.config = { ...DEFAULT_TRANSFER_GATE_CONFIG, ...config };
    }
    /**
     * Check if a skill has passed required transfer tests
     *
     * @param skillId - Skill to check
     * @param testResults - All transfer test results for this learner
     * @param tests - All available transfer tests
     * @returns true if skill is unlocked (all required tests passed)
     */
    isSkillUnlocked(skillId, testResults, tests) {
        const requiredTests = this.getRequiredTests(skillId, tests);
        if (requiredTests.length === 0) {
            // No tests required for this skill
            return true;
        }
        const passedTestIds = new Set(testResults.filter((r) => r.passed).map((r) => r.testId));
        // Check if all required tests are passed
        return requiredTests.every((test) => passedTestIds.has(test.id));
    }
    /**
     * Get required tests for a skill based on configuration
     *
     * @param skillId - Skill to get tests for
     * @param tests - All available transfer tests
     * @returns Array of required TransferTest objects
     */
    getRequiredTests(skillId, tests) {
        const skillTests = tests.filter((t) => t.skillId === skillId);
        const required = [];
        if (this.config.requireNearTransfer) {
            const nearTests = skillTests.filter((t) => t.transferType === 'near');
            // Sort for determinism
            nearTests.sort((a, b) => a.id.localeCompare(b.id));
            if (nearTests.length > 0) {
                required.push(nearTests[0]); // Require at least one near transfer
            }
        }
        if (this.config.requireFarTransfer) {
            const farTests = skillTests.filter((t) => t.transferType === 'far');
            // Sort for determinism
            farTests.sort((a, b) => a.id.localeCompare(b.id));
            if (farTests.length > 0) {
                required.push(farTests[0]); // Require at least one far transfer
            }
        }
        return required;
    }
    /**
     * Get pending (not yet passed) tests for a skill
     *
     * @param skillId - Skill to check
     * @param testResults - All transfer test results
     * @param tests - All available transfer tests
     * @returns Array of pending TransferTest objects
     */
    getPendingTests(skillId, testResults, tests) {
        const requiredTests = this.getRequiredTests(skillId, tests);
        const passedTestIds = new Set(testResults.filter((r) => r.passed).map((r) => r.testId));
        return requiredTests.filter((test) => !passedTestIds.has(test.id));
    }
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
    getNextTest(skillId, testResults, tests) {
        const pending = this.getPendingTests(skillId, testResults, tests);
        if (pending.length === 0) {
            return undefined;
        }
        // Prioritize near transfer first
        const nearPending = pending.filter((t) => t.transferType === 'near');
        if (nearPending.length > 0) {
            return nearPending[0];
        }
        return pending[0];
    }
    /**
     * Evaluate a transfer test attempt
     *
     * @param test - The test taken
     * @param score - Score achieved (0-1)
     * @param timestamp - When the test was taken
     * @returns TransferTestResult
     */
    evaluateAttempt(test, score, timestamp) {
        return {
            testId: test.id,
            passed: score >= test.passingScore,
            score,
            timestamp,
        };
    }
    /**
     * Get transfer test status for all skills
     *
     * @param testResults - All test results
     * @param tests - All available tests
     * @param skillIds - Skills to check
     * @returns Map of skillId to status
     */
    getTransferStatus(testResults, tests, skillIds) {
        const result = new Map();
        for (const skillId of skillIds) {
            const required = this.getRequiredTests(skillId, tests);
            const pending = this.getPendingTests(skillId, testResults, tests);
            const skillResults = testResults.filter((r) => tests.find((t) => t.id === r.testId)?.skillId === skillId);
            result.set(skillId, {
                skillId,
                isUnlocked: this.isSkillUnlocked(skillId, testResults, tests),
                requiredTests: required.length,
                passedTests: required.length - pending.length,
                pendingTests: pending.length,
                attempts: skillResults.length,
                lastAttempt: skillResults.length > 0 ? Math.max(...skillResults.map((r) => r.timestamp)) : undefined,
            });
        }
        return result;
    }
    /**
     * Create a transfer test specification
     */
    createTest(id, skillId, transferType, context, passingScore = 0.7) {
        return {
            id,
            skillId,
            transferType,
            context,
            passingScore,
        };
    }
}
/**
 * Factory function to create a TransferGate
 */
export function createTransferGate(config = {}) {
    return new TransferGateImpl(config);
}
//# sourceMappingURL=TransferGateImpl.js.map