import {Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {Bucket, BucketAccessControl} from 'aws-cdk-lib/aws-s3';
import {ApplicationLoadBalancedFargateService} from 'aws-cdk-lib/aws-ecs-patterns';
import {Cluster, ContainerImage} from 'aws-cdk-lib/aws-ecs';
import {Vpc} from 'aws-cdk-lib/aws-ec2';
import {HostedZone} from 'aws-cdk-lib/aws-route53';
import {DomainName} from 'aws-cdk-lib/aws-apigateway';
import {Certificate} from 'aws-cdk-lib/aws-certificatemanager';

export class FerdigStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        new Bucket(this, 'ferdig-files', {
            accessControl: BucketAccessControl.PRIVATE,
            bucketName: 'ferdig-files',
            publicReadAccess: false,
        });

        const ferdigFargateVPC = new Vpc(this, 'ferdig-fargate-vpc', {
            maxAzs: 2,
        });

        const ferdigFargateCluster = new Cluster(this, 'ferdig-fargate-cluster', {
            clusterName: 'ferdig-fargate-cluster',
            vpc: ferdigFargateVPC,
        });

        const ferdigImage = ContainerImage.fromRegistry('ferdig/ferdig');

        const ferdigDomainZone = new HostedZone(this, 'ferdig-hosted-zone', {
            zoneName: 'app.ferdig.de',
        });

        const domainName = 'app.ferdig.de';

        const sslCertificate = new Certificate(this, 'ferdig-domain-certificate', {
            domainName,
        });

        new DomainName(this, 'ferdig-domain-name', {
            domainName,
            certificate: sslCertificate,
        });

        new ApplicationLoadBalancedFargateService(this, 'ferdig-fargate-service', {
            cluster: ferdigFargateCluster,
            cpu: 256,
            memoryLimitMiB: 1024,
            desiredCount: 1,
            publicLoadBalancer: true,
            taskImageOptions: {
                image: ferdigImage,
            },
            domainZone: ferdigDomainZone,
            domainName,
        });
    }
}
