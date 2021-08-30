#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {Tags} from 'aws-cdk-lib';
import {FerdigStack} from '../lib/ferdig-stack';
import fetch from 'node-fetch';

const app = new cdk.App();

Tags.of(app).add('application', 'ferdig');


const run = async () => {
    const latestFerdigVersion = await fetch('https://raw.githubusercontent.com/jappyjan/ferdig/main/package.json')
        .then((response) => response.json())
        .then((packageJson) => packageJson.version) as string;

    console.log('Latest Ferdig Version is:', latestFerdigVersion);

    new FerdigStack(
        app,
        'Ferdig',
        latestFerdigVersion,
        {
            env: {
                account: process.env.CDK_DEFAULT_ACCOUNT,
                region: process.env.CDK_DEFAULT_REGION,
            },
        },
    );
}

run();
