import {Duration, Stack, StackProps, Tags} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {Bucket, BucketAccessControl} from 'aws-cdk-lib/aws-s3';
import {ApplicationLoadBalancedFargateService} from 'aws-cdk-lib/aws-ecs-patterns';
import {Cluster, ContainerImage, DeploymentControllerType, FargateTaskDefinition, Protocol} from 'aws-cdk-lib/aws-ecs';
import {InstanceClass, InstanceSize, InstanceType, ISecurityGroup, SecurityGroup, Vpc} from 'aws-cdk-lib/aws-ec2';
import {HostedZone} from 'aws-cdk-lib/aws-route53';
import {DomainName} from 'aws-cdk-lib/aws-apigateway';
import {Certificate, CertificateValidation} from 'aws-cdk-lib/aws-certificatemanager';
import {Credentials, DatabaseInstance, DatabaseInstanceEngine, PostgresEngineVersion} from 'aws-cdk-lib/aws-rds';
import {RetentionDays} from 'aws-cdk-lib/aws-logs';
import {StringParameter} from 'aws-cdk-lib/aws-ssm';
import {Secret} from 'aws-cdk-lib/aws-secretsmanager';
import {DatabaseCluster as DocDbCluster} from 'aws-cdk-lib/aws-docdb';
import {ApplicationProtocol} from 'aws-cdk-lib/aws-elasticloadbalancingv2';

export class FerdigStack extends Stack {
    private defaultSecurityGroup: ISecurityGroup | null = null;
    private postgresUsername: string | null = null;
    private postgresCredentialsSecret: Secret | null = null;
    private postgresPassword: StringParameter | null = null;
    private postgresDatabaseName: string | null = null;
    private postgresInstance: DatabaseInstance | null = null;
    private vpc: Vpc | null = null;
    private mongoUsername: string | null = null;
    private bucketName: string | null = null;
    private mongoPassword: Secret | null = null;
    private mongoCluster: DocDbCluster | null = null;

    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        Tags.of(this).add('application', 'ferdig');

        this.createVpc();

        this.createBucket();

        this.createPostgres();
        this.createMongo();

        this.createFerdigCluster();
    }

    private createBucket() {
        this.bucketName = 'ferdig-files';
        new Bucket(this, 'ferdig-files', {
            accessControl: BucketAccessControl.PRIVATE,
            bucketName: this.bucketName,
            publicReadAccess: false,
        });
    }

    private createVpc() {
        this.vpc = new Vpc(this, 'ferdig-fargate-vpc', {
            maxAzs: 2,
        });

        this.defaultSecurityGroup = SecurityGroup.fromSecurityGroupId(this, 'ferdig-security-group-default', this.vpc.vpcDefaultSecurityGroup);
    }

    private createPostgres() {
        this.postgresUsername = 'ferdig-postgres';

        this.postgresCredentialsSecret = new Secret(this, 'ferdig-secret-postgres-credentials', {
            secretName: 'ferdig-secret-postgres-credentials',
            generateSecretString: {
                secretStringTemplate: JSON.stringify({
                    username: this.postgresUsername,
                }),
                excludePunctuation: true,
                includeSpace: false,
                generateStringKey: 'password',
            },
        });

        this.postgresPassword = new StringParameter(this, 'ferdig-string-parameter-postgres-credentials-arn', {
            parameterName: `ferdig-string-parameter-postgres-credentials-arn`,
            stringValue: this.postgresCredentialsSecret.secretArn,
        });

        this.postgresDatabaseName = 'ferdig';

        if (!this.vpc) {
            throw new Error('VPC not yet created');
        }

        if (!this.defaultSecurityGroup) {
            throw new Error('Default Security Group not yet created');
        }

        this.postgresInstance = new DatabaseInstance(this, 'ferdig-rds-postgres', {
            engine: DatabaseInstanceEngine.postgres({
                version: PostgresEngineVersion.VER_13_3,
            }),
            vpc: this.vpc,
            cloudwatchLogsRetention: RetentionDays.TWO_WEEKS,
            instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MICRO),
            securityGroups: [this.defaultSecurityGroup],
            credentials: Credentials.fromSecret(this.postgresCredentialsSecret),
            databaseName: this.postgresDatabaseName,
        });
    }

    private createMongo() {
        this.mongoUsername = 'ferdig-mongo';

        if (!this.vpc) {
            throw new Error('VPC not yet created');
        }

        this.mongoPassword = new Secret(this, 'ferdig-secret-mongo-password', {
            secretName: 'ferdig-secret-postgres-credentials',
            generateSecretString: {
                excludePunctuation: true,
                includeSpace: false,
            },
        });

        this.mongoCluster = new DocDbCluster(this, 'ferdig-mongo-cluster', {
            instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.NANO),
            masterUser: {
                username: this.mongoUsername,
                password: this.mongoPassword.secretValue,
            },
            vpc: this.vpc,
            instances: 1,
        });
    }

    private createFerdigCluster() {
        if (!this.vpc) {
            throw new Error('VPC not yet created');
        }

        const taskDefinition = new FargateTaskDefinition(this, `ferdig-fargate-task-definition`, {
            cpu: 256,
            memoryLimitMiB: 512,
        });

        const ferdigImage = ContainerImage.fromRegistry('ferdig/ferdig');

        if (!this.postgresInstance || !this.postgresPassword || !this.postgresUsername || !this.postgresDatabaseName) {
            throw new Error('Postgres not yet setup');
        }

        if (!this.mongoCluster || !this.mongoPassword || !this.mongoUsername) {
            throw new Error('Mongo not yet setup');
        }

        const authJwtSecret = new Secret(this, 'ferdig-secret-auth-jwt', {
            secretName: 'ferdig-secret-auth-jwt',
            generateSecretString: {
                excludePunctuation: true,
                includeSpace: false,
                requireEachIncludedType: true,
                generateStringKey: 'secret',
                secretStringTemplate: '{}'
            },
        });

        const sessionSecret = new Secret(this, 'ferdig-secret-session-secret', {
            secretName: 'ferdig-secret-session-secret',
            generateSecretString: {
                excludePunctuation: true,
                includeSpace: false,
                requireEachIncludedType: true,
                generateStringKey: 'secret',
                secretStringTemplate: '{}'
            },
        });

        if (!this.bucketName) {
            throw new Error('S3 not yet setup');
        }

        taskDefinition.addContainer(`ferdig-fargate-container`, {
            image: ferdigImage,
            portMappings: [{
                containerPort: 443,
                hostPort: 443,
                protocol: Protocol.TCP,
            }],
            environment: {
                AUTH_JWT_SECRET: authJwtSecret.secretValueFromJson('secret').toString(),
                SESSION_SECRET: sessionSecret.secretValueFromJson('secret').toString(),

                AUTOMATIONS_LOG_RETENTION_HOURS: '48',
                AGENDA_MONGO_CONNECTION_STRING: `mongodb://${this.mongoUsername}:${this.mongoPassword.secretValue.toString()}@${this.mongoCluster.clusterEndpoint}`,

                POSTGRES_HOST: this.postgresInstance.dbInstanceEndpointAddress,
                POSTGRES_USERNAME: this.postgresUsername,
                POSTGRES_PASSWORD: this.postgresPassword.stringValue,
                POSTGRES_DATABASE: this.postgresDatabaseName,

                EMAIL_USE_MAILCATCHER: 'TRUE',
                EMAIL_DEBUG: 'FALSE',

                FILE_BUCKET_TYPE: 's3',
                AWS_S3_BUCKET: this.bucketName,

                PORT: '443',
            },
            stopTimeout: Duration.seconds(60),
        });

        const ferdigFargateCluster = new Cluster(this, 'ferdig-fargate-cluster', {
            clusterName: 'ferdig-fargate-cluster',
            vpc: this.vpc,
        });

        const ferdigDomainZone = new HostedZone(this, 'ferdig-hosted-zone', {
            zoneName: 'app.ferdig.de',
        });

        const domainName = 'app.ferdig.de';

        const sslCertificate = new Certificate(this, 'ferdig-domain-certificate', {
            domainName,
            validation: CertificateValidation.fromDns(ferdigDomainZone),
        });

        new DomainName(this, 'ferdig-domain-name', {
            domainName,
            certificate: sslCertificate,
        });

        const service = new ApplicationLoadBalancedFargateService(this, 'ferdig-fargate-service', {
            cluster: ferdigFargateCluster,
            cpu: 256,
            memoryLimitMiB: 1024,
            desiredCount: 1,
            publicLoadBalancer: true,
            domainZone: ferdigDomainZone,
            domainName,
            taskDefinition,
            protocol: ApplicationProtocol.HTTPS,
            healthCheckGracePeriod: Duration.seconds(30),
            assignPublicIp: true,
            deploymentController: {type: DeploymentControllerType.ECS},
        });

        service.targetGroup.configureHealthCheck({
            path: '/health',
            timeout: Duration.seconds(10),
            healthyThresholdCount: 2,
            unhealthyThresholdCount: 2,
            interval: Duration.seconds(30),
        });
    }
}
