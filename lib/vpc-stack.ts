import {Construct} from 'constructs';
import * as EC2 from 'aws-cdk-lib/aws-ec2';

export class VPCStack {
    public readonly vpc: EC2.Vpc;

    constructor(scope: Construct) {
        this.vpc = new EC2.Vpc(scope, 'ferdig-fargate-vpc', {
            maxAzs: 2,
        });
    }
}
