# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - ATS Adapter Failures
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Test concrete failing cases: Greenhouse/Workable stubs throwing "not yet implemented" errors and Ashby runtime failures
  - Test that GreenhouseAdapter.openApplication() throws "not yet implemented" for boards.greenhouse.io URLs (from Bug Condition in design)
  - Test that WorkableAdapter.openApplication() throws "not yet implemented" for apply.workable.com URLs (from Bug Condition in design)
  - Test that AshbyAdapter may fail during field extraction, form filling, resume upload, or submission with various adapter-specific errors (from Bug Condition in design)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found to understand root cause
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Lever Adapter and Core System Functionality
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs (Lever applications and core system functionality)
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements
  - Test Lever adapter continues working exactly as before across job URLs and profile combinations (from Preservation Requirements in design)
  - Test ATS platform detection and routing logic remains unchanged for all platform types (from Preservation Requirements in design)
  - Test BaseAdapter contract and field mapping services continue working (from Preservation Requirements in design)
  - Property-based testing generates many test cases for stronger guarantees
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 3. Fix broken ATS adapters

  - [x] 3.1 Implement complete Greenhouse adapter functionality
    - Create greenhouseAdapter.js with full BaseAdapter implementation
    - Implement openApplication() to handle boards.greenhouse.io and job-boards.greenhouse.io domains
    - Implement getFields() using Greenhouse-specific DOM patterns and form structures
    - Implement fillField() for Greenhouse form elements including location autocomplete and React form validation
    - Implement uploadResume() for Greenhouse file handling with proper upload progress detection
    - Implement submit() with Greenhouse-specific CAPTCHA systems and success/error detection patterns
    - _Bug_Condition: isBugCondition(input) where input.atsDetector.detectPlatform(input.jobUrl) = 'greenhouse'_
    - _Expected_Behavior: successfulFieldExtraction AND successfulFormFilling AND successfulResumeUpload AND successfulSubmission_
    - _Preservation: Lever adapter and core system functionality from Preservation Requirements_
    - _Requirements: 2.1, 2.4, 2.5, 2.6_

  - [x] 3.2 Implement complete Workable adapter functionality  
    - Create workableAdapter.js with full BaseAdapter implementation
    - Implement openApplication() to handle apply.workable.com domain and job URL patterns
    - Implement getFields() for Workable form structures and question patterns
    - Implement fillField() for Workable form controls including location fields and validation
    - Implement uploadResume() for Workable file systems with upload interface detection
    - Implement submit() with Workable-specific submission buttons and confirmation flows
    - _Bug_Condition: isBugCondition(input) where input.atsDetector.detectPlatform(input.jobUrl) = 'workable'_
    - _Expected_Behavior: successfulFieldExtraction AND successfulFormFilling AND successfulResumeUpload AND successfulSubmission_
    - _Preservation: Lever adapter and core system functionality from Preservation Requirements_
    - _Requirements: 2.2, 2.4, 2.5, 2.6_

  - [x] 3.3 Debug and fix existing Ashby adapter issues
    - Fix getFields() DOM navigation issues with improved CSS selector patterns and fallback mechanisms
    - Fix fillField() robustness with better locator strategies and retry mechanisms for transient DOM issues
    - Fix uploadResume() file detection issues with improved file input detection and fallback strategies
    - Fix submit() completion detection with better success/error state detection and CAPTCHA handling
    - Remove unused cssEscape function or integrate it properly into CSS selector building logic
    - _Bug_Condition: isBugCondition(input) where input.atsDetector.detectPlatform(input.jobUrl) = 'ashby' AND runtime failures occur_
    - _Expected_Behavior: successfulFieldExtraction AND successfulFormFilling AND successfulResumeUpload AND successfulSubmission_
    - _Preservation: Lever adapter and core system functionality from Preservation Requirements_
    - _Requirements: 2.3, 2.4, 2.5, 2.6_

  - [ ] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Successful ATS Adapter Processing
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: Expected Behavior Properties from design_

  - [~] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Lever Adapter and Core System Functionality  
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [~] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.