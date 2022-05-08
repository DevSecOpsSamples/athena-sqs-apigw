#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ApigwAthenaSqsStack } from '../lib/athena-sqs-apigw';

const app = new cdk.App();
const env = app.node.tryGetContext('env') || 'dev';
new ApigwAthenaSqsStack(app, 'AthenaSqsApigw-' + env);
