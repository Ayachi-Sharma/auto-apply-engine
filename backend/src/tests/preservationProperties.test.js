import { test, describe } from 'node:test';
import assert from 'node:assert';

// Import the components to test for preservation
import { LeverAdapter } from '../adapters/leverAdapter.js';
import { BaseAdapter } from '../adapters/baseAdapter.js';
import { detectATS } from '../services/atsDetector.js';
import { mapFieldToProfile, getMissingFields, createInputQuestion } from '../services/fieldMapper.js';

/**
 * Preservation Property Tests (BEFORE implementing fix)
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 * 
 * IMPORTANT: Follow observation-first methodology
 * - Observe behavior on UNFIXED code for non-buggy inputs (Lever applications and core system functionality)
 * - Write property-based tests capturing observed behavior patterns from Preservation Requirements
 * - Test Lever adapter continues working exactly as before across job URLs and profile combinations
 * - Test ATS platform detection and routing logic remains unchanged for all platform types
 * - Test BaseAdapter contract and field mapping services continue working
 * 
 * EXPECTED OUTCOME: Tests PASS (this confirms baseline behavior to preserve)
 * 
 * Property 2: Preservation - Lever Adapter and Core System Functionality
 * Tests that Lever adapter and core system functionality from Preservation Requirements work correctly
 */

describe('Property 2: Preservation - Lever Adapter and Core System Functionality', () => {

  // Mock page object that simulates successful Lever behavior
  const createMockLeverPage = () => ({
    goto: async (url, options) => {
      console.log(`Mock navigation to: ${url}`);
      // Simulate successful navigation
      return Promise.resolve();
    },
    
    waitForLoadState: async (state, options) => {
      console.log(`Mock waiting for load state: ${state}`);
      if (state === "networkidle" && options?.timeout === 15000) {
        // Simulate occasional networkidle timeout (as seen in leverAdapter.js)
        throw new Error("Mock networkidle timeout");
      }
      return Promise.resolve();
    },
    
    title: async () => 'Software Engineer - Acme Corp',
    url: () => 'https://jobs.lever.co/acme/software-engineer/apply',
    
    locator: (selector) => ({
      count: async () => {
        // Mock typical Lever form fields
        if (selector.includes('input:not([type=\'hidden\']), textarea, select')) {
          return 8; // Typical number of fields
        }
        if (selector.includes('#resume-upload-input')) {
          return 1;
        }
        if (selector.includes('#btn-submit')) {
          return 1;
        }
        return 0;
      },
      
      evaluateAll: async (fn) => {
        // Mock typical Lever form fields based on actual leverAdapter.js behavior
        const mockElements = [
          {
            id: 'name-field', name: 'name', tagName: 'INPUT', type: 'text',
            getAttribute: (attr) => {
              if (attr === 'name') return 'name';
              if (attr === 'type') return 'text';
              if (attr === 'placeholder') return 'Enter your full name';
              return null;
            },
            required: true
          },
          {
            id: 'email-field', name: 'email', tagName: 'INPUT', type: 'email',
            getAttribute: (attr) => {
              if (attr === 'name') return 'email';
              if (attr === 'type') return 'email';
              if (attr === 'placeholder') return 'Enter your email';
              return null;
            },
            required: true
          },
          {
            id: 'phone-field', name: 'phone', tagName: 'INPUT', type: 'tel',
            getAttribute: (attr) => {
              if (attr === 'name') return 'phone';
              if (attr === 'type') return 'tel';
              if (attr === 'placeholder') return 'Enter your phone number';
              return null;
            },
            required: false
          },
          {
            id: 'location-field', name: 'location', tagName: 'INPUT', type: 'text',
            getAttribute: (attr) => {
              if (attr === 'name') return 'location';
              if (attr === 'type') return 'text';
              if (attr === 'placeholder') return 'Enter your location';
              return null;
            },
            required: false
          },
          {
            id: 'org-field', name: 'org', tagName: 'INPUT', type: 'text',
            getAttribute: (attr) => {
              if (attr === 'name') return 'org';
              if (attr === 'type') return 'text';
              if (attr === 'placeholder') return 'Current company';
              return null;
            },
            required: false
          },
          {
            id: 'linkedin-field', name: 'urls[LinkedIn]', tagName: 'INPUT', type: 'url',
            getAttribute: (attr) => {
              if (attr === 'name') return 'urls[LinkedIn]';
              if (attr === 'type') return 'url';
              if (attr === 'placeholder') return 'LinkedIn profile URL';
              return null;
            },
            required: false
          },
          {
            id: 'github-field', name: 'urls[GitHub]', tagName: 'INPUT', type: 'url',
            getAttribute: (attr) => {
              if (attr === 'name') return 'urls[GitHub]';
              if (attr === 'type') return 'url';
              if (attr === 'placeholder') return 'GitHub profile URL';
              return null;
            },
            required: false
          },
          {
            id: 'pronouns-select', name: 'pronouns', tagName: 'SELECT', type: 'select',
            getAttribute: (attr) => {
              if (attr === 'name') return 'pronouns';
              if (attr === 'type') return null;
              return null;
            },
            required: false,
            options: [
              { value: '', textContent: 'Select pronouns' },
              { value: 'he/him', textContent: 'he/him' },
              { value: 'she/her', textContent: 'she/her' },
              { value: 'they/them', textContent: 'they/them' }
            ]
          }
        ];

        // Simulate the complex field extraction logic from leverAdapter.js
        return mockElements.map(element => ({
          id: element.id,
          name: element.name,
          label: element.name === 'name' ? 'Full Name' :
                 element.name === 'email' ? 'Email Address' :
                 element.name === 'phone' ? 'Phone Number' :
                 element.name === 'location' ? 'Location' :
                 element.name === 'org' ? 'Current Company' :
                 element.name === 'urls[LinkedIn]' ? 'LinkedIn Profile' :
                 element.name === 'urls[GitHub]' ? 'GitHub Profile' :
                 element.name === 'pronouns' ? 'Pronouns' :
                 element.name,
          type: element.tagName.toLowerCase() === 'select' ? 'select' : element.getAttribute('type'),
          required: element.required,
          placeholder: element.getAttribute('placeholder'),
          ariaLabel: element.getAttribute('aria-label'),
          options: element.options ? element.options.map(opt => ({
            value: opt.value,
            label: opt.textContent.trim()
          })).filter(opt => opt.label) : []
        }));
      },
      
      first: () => ({
        waitFor: async (options) => Promise.resolve(),
        setInputFiles: async (filePath) => {
          console.log(`Mock resume upload: ${filePath}`);
          return Promise.resolve();
        },
        isVisible: async () => true,
        click: async () => Promise.resolve(),
        scrollIntoViewIfNeeded: async () => Promise.resolve()
      }),
      
      fill: async (value) => {
        console.log(`Mock fill field with: ${value}`);
        return Promise.resolve();
      },
      
      selectOption: async (option) => {
        console.log(`Mock select option: ${JSON.stringify(option)}`);
        return Promise.resolve();
      },
      
      click: async () => Promise.resolve(),
      
      nth: (index) => ({
        getAttribute: async (attr) => {
          if (attr === 'value') return `option-${index}`;
          if (attr === 'id') return `field-${index}`;
          return null;
        },
        isChecked: async () => false,
        check: async () => Promise.resolve(),
        evaluate: async (fn) => Promise.resolve()
      }),
      
      allInnerTexts: async () => ['Option 1', 'Option 2', 'Option 3'],
      
      inputValue: async () => 'mock-input-value',
      
      innerText: async () => 'Application submitted successfully! Thank you for your interest.',
      
      waitFor: async (options) => Promise.resolve(),
      isVisible: async () => true,
      scrollIntoViewIfNeeded: async () => Promise.resolve(),
      click: async (options) => Promise.resolve(),
      evaluate: async (fn) => Promise.resolve()
    }),
    
    evaluate: async (fn, ...args) => {
      // Mock specific evaluate calls from leverAdapter.js
      if (typeof fn === 'function') {
        // Mock DOM rescue evaluation
        return null;
      }
      return Promise.resolve();
    },
    
    waitForFunction: async (fn, options) => {
      console.log('Mock waiting for function condition');
      return Promise.resolve(true);
    },
    
    waitForTimeout: async (ms) => {
      console.log(`Mock wait for ${ms}ms`);
      return Promise.resolve();
    },
    
    waitForURL: async (predicate, options) => {
      console.log('Mock wait for URL change');
      return Promise.resolve();
    },
    
    on: (event, handler) => {},
    off: (event, handler) => {}
  });

  test('Preservation: Lever adapter openApplication() works across job URL variations', async (t) => {
    console.log('\n=== Testing Lever Adapter URL Handling Preservation ===');
    
    const mockPage = createMockLeverPage();
    const adapter = new LeverAdapter(mockPage);
    
    // Test various Lever URL formats based on leverAdapter.js logic
    const leverUrlVariations = [
      {
        input: 'https://jobs.lever.co/acme',
        expected: 'https://jobs.lever.co/acme/apply'
      },
      {
        input: 'https://jobs.lever.co/acme/',
        expected: 'https://jobs.lever.co/acme/apply'
      },
      {
        input: 'https://jobs.lever.co/acme/software-engineer',
        expected: 'https://jobs.lever.co/acme/software-engineer/apply'
      },
      {
        input: 'https://jobs.lever.co/acme/software-engineer/',
        expected: 'https://jobs.lever.co/acme/software-engineer/apply'
      },
      {
        input: 'https://jobs.lever.co/acme/software-engineer/apply',
        expected: 'https://jobs.lever.co/acme/software-engineer/apply'
      },
      {
        input: 'https://jobs.lever.co/acme?utm_source=linkedin&utm_medium=social',
        expected: 'https://jobs.lever.co/acme/apply'
      },
      {
        input: 'https://jobs.lever.co/acme/job#section',
        expected: 'https://jobs.lever.co/acme/job/apply'
      }
    ];
    
    for (const { input, expected } of leverUrlVariations) {
      console.log(`Testing URL transformation: ${input} → ${expected}`);
      
      try {
        // Override the goto method to capture the final URL
        let finalUrl = null;
        mockPage.goto = async (url, options) => {
          finalUrl = url;
          console.log(`Navigation to: ${url}`);
          return Promise.resolve();
        };
        
        await adapter.openApplication(input);
        
        assert.strictEqual(finalUrl, expected, 
          `URL transformation failed. Expected: ${expected}, Got: ${finalUrl}`);
        
        console.log(`✅ URL correctly transformed and navigation succeeded`);
        
      } catch (error) {
        console.error(`❌ openApplication failed for ${input}: ${error.message}`);
        throw error;
      }
    }
    
    console.log('✅ All Lever URL variations handled correctly');
  });

  test('Preservation: Lever adapter getFields() extracts form fields correctly', async (t) => {
    console.log('\n=== Testing Lever Adapter Field Extraction Preservation ===');
    
    const mockPage = createMockLeverPage();
    const adapter = new LeverAdapter(mockPage);
    
    try {
      const fields = await adapter.getFields();
      
      console.log(`Extracted ${fields.length} fields`);
      console.log('Fields:', fields.map(f => `${f.name}:${f.type}:${f.label}`));
      
      // Verify we got the expected Lever fields
      assert(Array.isArray(fields), 'getFields should return an array');
      assert(fields.length > 0, 'Should extract at least some fields');
      
      // Check for core Lever fields
      const fieldNames = fields.map(f => f.name);
      const expectedFields = ['name', 'email', 'phone', 'location', 'org'];
      
      for (const expectedField of expectedFields) {
        assert(fieldNames.includes(expectedField), 
          `Should include ${expectedField} field`);
      }
      
      // Verify field structure matches expected format
      for (const field of fields) {
        assert(typeof field.name === 'string', 'Field name should be string');
        assert(typeof field.type === 'string', 'Field type should be string');
        assert(typeof field.required === 'boolean', 'Field required should be boolean');
        
        // Label should be present for Lever fields (not null/undefined)
        assert(field.label !== null && field.label !== undefined, 
          `Field ${field.name} should have a label`);
      }
      
      console.log('✅ Field extraction works correctly and returns expected structure');
      
    } catch (error) {
      console.error(`❌ Field extraction failed: ${error.message}`);
      throw error;
    }
  });

  test('Preservation: Lever adapter fillField() handles different field types', async (t) => {
    console.log('\n=== Testing Lever Adapter Field Filling Preservation ===');
    
    const mockPage = createMockLeverPage();
    const adapter = new LeverAdapter(mockPage);
    
    // Test field filling for different field types based on leverAdapter.js
    const testFields = [
      { 
        field: { id: 'name-field', name: 'name', type: 'text', required: true },
        value: 'John Doe'
      },
      { 
        field: { id: 'email-field', name: 'email', type: 'email', required: true },
        value: 'john.doe@example.com'
      },
      { 
        field: { id: 'location-field', name: 'location', type: 'text', required: false },
        value: 'San Francisco, CA'
      },
      { 
        field: { id: 'pronouns-select', name: 'pronouns', type: 'select', required: false },
        value: 'he/him'
      },
      {
        field: { name: 'eeo[disabilitySignatureDate]', type: 'text', required: false },
        value: '12/25/2023' // Should be auto-corrected to today's date
      }
    ];
    
    for (const { field, value } of testFields) {
      console.log(`Testing field fill: ${field.name} = ${value}`);
      
      try {
        await adapter.fillField(field, value);
        console.log(`✅ Successfully filled ${field.name}`);
      } catch (error) {
        console.error(`❌ Failed to fill ${field.name}: ${error.message}`);
        throw error;
      }
    }
    
    // Test error handling for missing values
    try {
      await adapter.fillField({ name: 'test', type: 'text' }, null);
      assert.fail('Should throw error for null value');
    } catch (error) {
      assert(error.message.includes('No value provided'), 
        'Should throw appropriate error for missing value');
      console.log('✅ Correctly handles null values');
    }
    
    console.log('✅ Field filling works correctly for all types');
  });

  test('Preservation: Lever adapter uploadResume() handles file upload', async (t) => {
    console.log('\n=== Testing Lever Adapter Resume Upload Preservation ===');
    
    const mockPage = createMockLeverPage();
    const adapter = new LeverAdapter(mockPage);
    
    const testFilePath = '/fake/path/resume.pdf';
    
    try {
      await adapter.uploadResume(testFilePath);
      console.log('✅ Resume upload completed successfully');
    } catch (error) {
      console.error(`❌ Resume upload failed: ${error.message}`);
      throw error;
    }
    
    // Test error handling for missing file path
    try {
      await adapter.uploadResume(null);
      assert.fail('Should throw error for missing file path');
    } catch (error) {
      assert(error.message.includes('Resume file path is required'), 
        'Should throw appropriate error for missing file path');
      console.log('✅ Correctly handles missing file path');
    }
    
    console.log('✅ Resume upload works correctly');
  });

  test('Preservation: Lever adapter submit() completes application flow', async (t) => {
    console.log('\n=== Testing Lever Adapter Submission Preservation ===');
    
    const mockPage = createMockLeverPage();
    
    // Override specific methods to simulate successful submission
    mockPage.waitForURL = async (predicate, options) => {
      console.log('Mock redirect to /thanks page');
      return Promise.resolve();
    };
    
    mockPage.url = () => 'https://jobs.lever.co/acme/software-engineer/thanks';
    
    const adapter = new LeverAdapter(mockPage);
    
    try {
      const result = await adapter.submit();
      
      console.log('Submission result:', JSON.stringify(result, null, 2));
      
      // Verify result structure
      assert(typeof result === 'object', 'Should return an object');
      assert(typeof result.receipt === 'object', 'Should include receipt object');
      assert(typeof result.confirmationText === 'string', 'Should include confirmation text');
      
      console.log('✅ Application submission completed successfully');
      
    } catch (error) {
      console.error(`❌ Application submission failed: ${error.message}`);
      throw error;
    }
  });

  test('Preservation: ATS platform detection remains unchanged', async (t) => {
    console.log('\n=== Testing ATS Platform Detection Preservation ===');
    
    // Test all platform detection cases from atsDetector.js
    const testCases = [
      { url: 'https://jobs.lever.co/acme/job', expected: 'lever' },
      { url: 'https://boards.greenhouse.io/acme/jobs/123', expected: 'greenhouse' },
      { url: 'https://job-boards.greenhouse.io/acme/jobs/123', expected: 'greenhouse' },
      { url: 'https://jobs.ashbyhq.com/acme/job-123', expected: 'ashby' },
      { url: 'https://apply.workable.com/acme/j/ABC123/', expected: 'workable' }
    ];
    
    for (const { url, expected } of testCases) {
      console.log(`Testing platform detection: ${url} → ${expected}`);
      
      try {
        const detected = detectATS(url);
        assert.strictEqual(detected, expected, 
          `Platform detection failed. Expected: ${expected}, Got: ${detected}`);
        console.log(`✅ Correctly detected platform: ${detected}`);
      } catch (error) {
        console.error(`❌ Platform detection failed for ${url}: ${error.message}`);
        throw error;
      }
    }
    
    // Test error handling for unsupported platforms
    const unsupportedUrls = [
      'https://unknown-ats.com/job/123',
      'https://jobs.example.com/posting/456',
      'invalid-url'
    ];
    
    for (const url of unsupportedUrls) {
      console.log(`Testing unsupported platform: ${url}`);
      
      try {
        const detected = detectATS(url);
        assert.fail(`Should throw error for unsupported platform: ${url}, but got: ${detected}`);
      } catch (error) {
        console.log(`✅ Correctly threw error for unsupported platform: ${error.message}`);
        assert(error.message.includes('Unsupported ATS') || error.message.includes('Invalid job URL'),
          'Should throw appropriate error for unsupported platform');
      }
    }
    
    console.log('✅ ATS platform detection works correctly for all cases');
  });

  test('Preservation: BaseAdapter contract remains unchanged', async (t) => {
    console.log('\n=== Testing BaseAdapter Contract Preservation ===');
    
    const mockPage = {};
    const baseAdapter = new BaseAdapter(mockPage);
    
    // Verify BaseAdapter has all required methods
    const requiredMethods = ['openApplication', 'getFields', 'fillField', 'uploadResume', 'submit'];
    
    for (const methodName of requiredMethods) {
      assert(typeof baseAdapter[methodName] === 'function', 
        `BaseAdapter should have ${methodName} method`);
      
      // Verify methods throw appropriate errors (since BaseAdapter is abstract)
      try {
        await baseAdapter[methodName]();
        assert.fail(`${methodName} should throw "must be implemented" error`);
      } catch (error) {
        assert(error.message.includes('must be implemented'), 
          `${methodName} should throw "must be implemented" error`);
        console.log(`✅ ${methodName}() correctly throws implementation error`);
      }
    }
    
    // Verify LeverAdapter properly extends BaseAdapter
    const leverAdapter = new LeverAdapter(mockPage);
    assert(leverAdapter instanceof BaseAdapter, 'LeverAdapter should extend BaseAdapter');
    assert(leverAdapter instanceof LeverAdapter, 'LeverAdapter should be instance of LeverAdapter');
    
    console.log('✅ BaseAdapter contract is preserved and working correctly');
  });

  test('Preservation: Field mapping service functionality', async (t) => {
    console.log('\n=== Testing Field Mapping Service Preservation ===');
    
    // Test profile for field mapping
    const testProfile = {
      personalInfo: {
        fullName: 'John Doe',
        email: 'john.doe@example.com',
        phone: '+1-555-123-4567',
        address: 'San Francisco, CA',
        profiles: [
          { platform: 'linkedin', url: 'https://linkedin.com/in/johndoe' },
          { platform: 'github', url: 'https://github.com/johndoe' },
          { platform: 'portfolio', url: 'https://johndoe.dev' }
        ]
      },
      experience: [
        { company: 'Acme Corp', current: true, title: 'Software Engineer' },
        { company: 'Previous Co', current: false, title: 'Junior Developer' }
      ]
    };
    
    // Test field mapping for various field types
    const testFields = [
      { name: 'name', label: 'Full Name', expected: 'John Doe' },
      { name: 'email', label: 'Email', expected: 'john.doe@example.com' },
      { name: 'phone', label: 'Phone', expected: '+1-555-123-4567' },
      { name: 'location', label: 'Location', expected: 'San Francisco, CA' },
      { name: 'org', label: 'Company', expected: 'Acme Corp' },
      { name: 'urls[LinkedIn]', label: 'LinkedIn', expected: 'https://linkedin.com/in/johndoe' },
      { name: 'urls[GitHub]', label: 'GitHub', expected: 'https://github.com/johndoe' },
      { name: 'urls[Portfolio]', label: 'Portfolio', expected: 'https://johndoe.dev' }
    ];
    
    for (const field of testFields) {
      console.log(`Testing field mapping: ${field.name}`);
      
      const mapping = mapFieldToProfile(field, testProfile);
      
      assert(typeof mapping === 'object', 'Should return mapping object');
      assert('value' in mapping, 'Should have value property');
      assert('source' in mapping, 'Should have source property');
      
      if (field.expected) {
        assert.strictEqual(mapping.value, field.expected,
          `Field ${field.name} should map to "${field.expected}", got "${mapping.value}"`);
        console.log(`✅ ${field.name} mapped correctly: ${mapping.value}`);
      }
    }
    
    // Test label-based matching (Ashby style)
    const ashbyStyleFields = [
      { label: 'Full Name', expected: 'John Doe' },
      { label: 'Email Address', expected: 'john.doe@example.com' },
      { label: 'Phone Number', expected: '+1-555-123-4567' },
      { label: 'Current Company', expected: 'Acme Corp' }
    ];
    
    for (const field of ashbyStyleFields) {
      console.log(`Testing label-based mapping: "${field.label}"`);
      
      const mapping = mapFieldToProfile(field, testProfile);
      
      if (field.expected) {
        assert.strictEqual(mapping.value, field.expected,
          `Field with label "${field.label}" should map to "${field.expected}"`);
        console.log(`✅ Label-based mapping works: ${mapping.value}`);
      }
    }
    
    // Test getMissingFields functionality
    const mockFields = [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'custom_question', label: 'Why do you want this job?', type: 'textarea', required: true }
    ];
    
    const missingFields = getMissingFields(mockFields, testProfile);
    console.log(`Missing fields: ${missingFields.length}`);
    
    // Should only have the custom question as missing (name and email are mapped)
    assert(missingFields.length === 1, 'Should have 1 missing field');
    assert(missingFields[0].field === 'custom_question', 'Missing field should be custom_question');
    
    console.log('✅ Field mapping service works correctly');
  });

  test('Preservation: Core system functionality works with property-based testing', async (t) => {
    console.log('\n=== Testing Core System Preservation with Multiple Scenarios ===');
    
    // Property-based style testing with multiple random scenarios
    const generateTestScenarios = () => {
      const scenarios = [];
      
      // Generate different Lever URL patterns
      const companies = ['acme', 'tech-corp', 'startup-inc', 'big-co'];
      const jobTitles = ['software-engineer', 'frontend-dev', 'backend-dev', 'fullstack-dev'];
      const urlVariants = ['', '/', '/apply'];
      const queryParams = ['', '?utm_source=linkedin', '?ref=company-site'];
      
      for (let i = 0; i < 10; i++) {
        const company = companies[Math.floor(Math.random() * companies.length)];
        const jobTitle = jobTitles[Math.floor(Math.random() * jobTitles.length)];
        const variant = urlVariants[Math.floor(Math.random() * urlVariants.length)];
        const query = queryParams[Math.floor(Math.random() * queryParams.length)];
        
        scenarios.push({
          url: `https://jobs.lever.co/${company}/${jobTitle}${variant}${query}`,
          platform: 'lever'
        });
      }
      
      return scenarios;
    };
    
    const scenarios = generateTestScenarios();
    console.log(`Testing ${scenarios.length} generated scenarios`);
    
    let successCount = 0;
    
    for (const scenario of scenarios) {
      console.log(`Testing scenario: ${scenario.url}`);
      
      try {
        // Test platform detection
        const detectedPlatform = detectATS(scenario.url);
        assert.strictEqual(detectedPlatform, scenario.platform,
          `Platform detection failed for ${scenario.url}`);
        
        // Test Lever adapter can handle the URL
        const mockPage = createMockLeverPage();
        const adapter = new LeverAdapter(mockPage);
        
        await adapter.openApplication(scenario.url);
        
        successCount++;
        console.log(`✅ Scenario ${successCount} passed`);
        
      } catch (error) {
        console.error(`❌ Scenario failed: ${scenario.url} - ${error.message}`);
        throw error;
      }
    }
    
    console.log(`✅ All ${successCount} scenarios passed - core system preserved`);
    
    // Test that non-Lever URLs are correctly rejected
    const nonLeverUrls = [
      'https://boards.greenhouse.io/acme/jobs/123',
      'https://apply.workable.com/acme/j/ABC123',
      'https://jobs.ashbyhq.com/acme/job-123'
    ];
    
    for (const url of nonLeverUrls) {
      const platform = detectATS(url);
      assert.notStrictEqual(platform, 'lever', 
        `Non-Lever URL ${url} should not be detected as lever`);
      console.log(`✅ Non-Lever URL correctly detected as: ${platform}`);
    }
    
    console.log('✅ Property-based testing confirms core system preservation');
  });
});