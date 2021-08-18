import * as cdk from 'aws-cdk-lib';
import * as FerdigAwsInfra from '../lib/ferdig-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new FerdigAwsInfra.FerdigStack(app, 'MyTestStack');
    // THEN
    const actual = app.synth().getStackArtifact(stack.artifactId).template;
    expect(actual.Resources ?? {}).toEqual({});
});
