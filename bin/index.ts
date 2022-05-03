#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ApigwAthenaSqsStack } from '../lib/apigw-athena-sqs';

const app = new cdk.App();
const env = app.node.tryGetContext('env') || 'dev';
new ApigwAthenaSqsStack(app, 'ApigwAthenaSqsStack-' + env);
