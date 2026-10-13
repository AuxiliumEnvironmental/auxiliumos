import config from './playwright.config';
import { defineConfig } from '@playwright/test';
export default defineConfig({...config,outputDir:'./artifacts/warm-switch/test-results',testMatch:['workflow.spec.ts','warm-switch.spec.ts']});
