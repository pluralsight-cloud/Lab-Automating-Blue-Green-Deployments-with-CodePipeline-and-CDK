#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ApiPipelineStack } from '../lib/api-pipeline-stack';

const app = new cdk.App();
new ApiPipelineStack(app, 'ApiPipelineStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});