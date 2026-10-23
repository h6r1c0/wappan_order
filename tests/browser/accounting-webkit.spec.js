import {test} from '@playwright/test';
import {registerAccountingTests} from './accounting-cases.js';
test.use({browserName:'webkit',launchOptions:{}});
registerAccountingTests('webkit');
