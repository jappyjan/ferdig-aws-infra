import {Duration, Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as ECSPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as ECS from 'aws-cdk-lib/aws-ecs';
import * as Route53 from 'aws-cdk-lib/aws-route53';
import * as Logs from 'aws-cdk-lib/aws-logs';
import * as SecretsManager from 'aws-cdk-lib/aws-secretsmanager';
import * as ElasticLoadBalancingV2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as EC2 from 'aws-cdk-lib/aws-ec2';
import {VPCStack} from './vpc-stack';
import {RDSStack} from './rds-stack';
import {S3Stack} from './s3-stack';
import * as IAM from 'aws-cdk-lib/aws-iam';

export class FerdigStack extends Stack {
    constructor(scope: Construct, id: string, imageVersion: string, props?: StackProps) {
        super(scope, id, props);

        const {vpc} = new VPCStack(this);

        const {
            instance: postgresInstance,
        } = new RDSStack(this, {vpc});

        const {filesBucket} = new S3Stack(this);

        const taskDefinition = new ECS.FargateTaskDefinition(this, `ferdig-fargate-task-definition`, {
            cpu: 256,
            memoryLimitMiB: 512,
        });

        const ferdigImage = ECS.ContainerImage.fromRegistry(`jappyjan/ferdig:${imageVersion}`);

        const authJwtSecret = new SecretsManager.Secret(this, 'ferdig-secret-auth-jwt', {
            secretName: 'ferdig-secret-auth-jwt',
        });

        const sessionSecret = new SecretsManager.Secret(this, 'ferdig-secret-session-secret', {
            secretName: 'ferdig-secret-session-secret',
        });

        const logger = new ECS.AwsLogDriver({
            streamPrefix: 'Backend',
            logRetention: Logs.RetentionDays.TWO_WEEKS,
        });

        new IAM.Policy(this, 'ferdig-ses-policy');

        taskDefinition.addContainer(`ferdig-fargate-container`, {
            image: ferdigImage,
            portMappings: [{
                containerPort: 80,
                protocol: ECS.Protocol.TCP,
            }],
            logging: logger,
            environment: {
                LOG_LEVEL: 'debug',
                AUTOMATIONS_LOG_RETENTION_HOURS: '48',

                EMAIL_USE_MAILCATCHER: 'TRUE',
                EMAIL_DEBUG: 'FALSE',

                FILE_BUCKET_TYPE: 's3',
                AWS_S3_BUCKET: filesBucket.bucketName,

                PORT: '80',
            },
            secrets: {
                POSTGRES_PASSWORD: ECS.Secret.fromSecretsManager(postgresInstance.secret!, 'password'),
                POSTGRES_USERNAME: ECS.Secret.fromSecretsManager(postgresInstance.secret!, 'username'),
                POSTGRES_DATABASE: ECS.Secret.fromSecretsManager(postgresInstance.secret!, 'dbname'),
                POSTGRES_HOST: ECS.Secret.fromSecretsManager(postgresInstance.secret!, 'host'),
                POSTGRES_PORT: ECS.Secret.fromSecretsManager(postgresInstance.secret!, 'port'),
                AUTH_JWT_SECRET: ECS.Secret.fromSecretsManager(authJwtSecret),
                SESSION_SECRET: ECS.Secret.fromSecretsManager(sessionSecret),
            },
            stopTimeout: Duration.seconds(60),
        });

        const ferdigFargateCluster = new ECS.Cluster(this, 'ferdig-fargate-cluster', {
            clusterName: 'ferdig-fargate-cluster',
            vpc,
        });

        const hostedZone = Route53.PublicHostedZone.fromLookup(this, 'ferdig-hosted-zone', {
            domainName: 'ferdig.de',
        });

        const appDomainName = 'app.ferdig.de';

        const service = new ECSPatterns.ApplicationLoadBalancedFargateService(this, 'ferdig-fargate-service', {
            cluster: ferdigFargateCluster,
            cpu: 256,
            memoryLimitMiB: 1024,
            desiredCount: 1,
            publicLoadBalancer: true,
            taskDefinition,
            domainZone: hostedZone,
            domainName: appDomainName,
            protocol: ElasticLoadBalancingV2.ApplicationProtocol.HTTPS,
            targetProtocol: ElasticLoadBalancingV2.ApplicationProtocol.HTTP,
            healthCheckGracePeriod: Duration.seconds(30),
            assignPublicIp: true,
            redirectHTTP: true,
            deploymentController: {type: ECS.DeploymentControllerType.ECS},
        });

        service.targetGroup.configureHealthCheck({
            path: '/api/health',
            timeout: Duration.seconds(15),
            healthyThresholdCount: 2,
            unhealthyThresholdCount: 2,
            interval: Duration.seconds(60),
        });

        service.taskDefinition.addToTaskRolePolicy(new IAM.PolicyStatement({
            effect: IAM.Effect.ALLOW,
            actions: ['ses:SendRawEmail'],
            resources: ['*'],
        }));

        postgresInstance.connections.allowFrom(
            service.service,
            EC2.Port.tcp(5432),
        );

        filesBucket.grantReadWrite(service.taskDefinition.taskRole);
    }
}
