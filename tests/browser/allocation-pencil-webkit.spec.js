import {test} from '@playwright/test';
import {registerAllocationTests} from './allocation-pencil-cases.js';
test.use({browserName:'webkit',launchOptions:{}});
registerAllocationTests('webkit');
