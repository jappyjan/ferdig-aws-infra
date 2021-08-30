import {Construct} from 'constructs';
import * as RDS from 'aws-cdk-lib/aws-rds';
import * as Logs from 'aws-cdk-lib/aws-logs';
import * as EC2 from 'aws-cdk-lib/aws-ec2';

interface Dependencies {
    vpc: EC2.Vpc;
}

export class RDSStack {
    public readonly instance: RDS.DatabaseInstance;

    constructor(scope: Construct, dependencies: Dependencies) {
        const databaseName = 'ferdig';

        this.instance = new RDS.DatabaseInstance(scope, 'ferdig-postgres-instance', {
            engine: RDS.DatabaseInstanceEngine.postgres({
                version: RDS.PostgresEngineVersion.VER_12_7,
            }),
            vpc: dependencies.vpc,
            cloudwatchLogsRetention: Logs.RetentionDays.TWO_WEEKS,
            instanceType: EC2.InstanceType.of(EC2.InstanceClass.T3, EC2.InstanceSize.MICRO),
            databaseName,
        });
        this.instance.addRotationSingleUser();
    }
}
