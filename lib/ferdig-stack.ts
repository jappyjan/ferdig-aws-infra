import {Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {Bucket, BucketAccessControl} from 'aws-cdk-lib/aws-s3';
import {ApplicationLoadBalancedFargateService} from 'aws-cdk-lib/aws-ecs-patterns';
import {Cluster, ContainerImage} from 'aws-cdk-lib/aws-ecs';
import {Vpc} from 'aws-cdk-lib/aws-ec2';

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

        new ApplicationLoadBalancedFargateService(this, 'ferdig-fargate-service', {
            cluster: ferdigFargateCluster,
            cpu: 256,
            memoryLimitMiB: 1024,
            desiredCount: 1,
            publicLoadBalancer: true,
            taskImageOptions: {
                image: ferdigImage,
            },
            domainName: 'app.ferdig.de'
        });
    }
}
