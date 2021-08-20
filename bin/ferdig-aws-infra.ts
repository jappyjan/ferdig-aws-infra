#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {FerdigStack} from '../lib/ferdig-stack';

const app = new cdk.App();
new FerdigStack(app, 'FerdigAwsInfraStack');
