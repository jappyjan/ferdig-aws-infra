import {Construct} from 'constructs';
import * as S3 from 'aws-cdk-lib/aws-s3';

export class S3Stack {
    public readonly filesBucket: S3.Bucket;

    constructor(scope: Construct) {
        this.filesBucket = new S3.Bucket(scope, 'ferdig-files', {
            accessControl: S3.BucketAccessControl.PRIVATE,
            publicReadAccess: false,
        });
    }
}
