import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class ApiPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 bucket for source code
    const sourceBucket = new s3.Bucket(this, 'SourceBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      versioned: true,
    });

    // IAM roles
    const codeBuildRole = new iam.Role(this, 'CodeBuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      inlinePolicies: {
        CodeBuildPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
                's3:GetObject',
                's3:PutObject',
                'cloudformation:*',
                'lambda:*',
                'apigateway:*',
                'iam:*',
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    const codePipelineRole = new iam.Role(this, 'CodePipelineRole', {
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
      inlinePolicies: {
        CodePipelinePolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:PutObject',
                'codebuild:BatchGetBuilds',
                'codebuild:StartBuild',
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    // CodeBuild project for SAM deployment
    const samBuildProject = new codebuild.Project(this, 'SamBuildProject', {
      role: codeBuildRole,
      source: codebuild.Source.s3({
        bucket: sourceBucket,
        path: 'lambda-api-sam.zip',
      }),
      // buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yaml'),
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: 22,
            },
            commands: [
              'pip install aws-sam-cli',
            ],
          },
          build: {
            commands: [
              'sam build',
              `sam package --template-file template.yaml --s3-bucket ${sourceBucket.bucketName} --output-template-file packaged.yaml`,
              `sam deploy --template-file packaged.yaml --stack-name lambda-api-sam-stack --s3-bucket ${sourceBucket.bucketName} --capabilities CAPABILITY_IAM`,
            ],
          },
        },
        artifacts: {
          files: ['**/*'],
        },
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        privileged: true,
      },
    });

    // CodePipeline
    const sourceOutput = new codepipeline.Artifact();
    const buildOutput = new codepipeline.Artifact();

    new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: 'globomantics-pipeline',
      role: codePipelineRole,
      stages: [
        {
          stageName: 'Source',
          actions: [
            new codepipeline_actions.S3SourceAction({
              actionName: 'S3Source',
              bucket: sourceBucket,
              bucketKey: 'lambda-api-sam.zip',
              output: sourceOutput,
              trigger: codepipeline_actions.S3Trigger.EVENTS,
            }),
          ],
        },
        {
          stageName: 'Build',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'SamBuildDeploy',
              project: samBuildProject,
              input: sourceOutput,
            }),
          ],
        }
        // {
        //   stageName: 'Deploy',
        //   actions: [
        //     new codepipeline_actions.CodeDeployLambdaDeployAction({
        //       actionName: 'DeployLambda',
        //       lambda: apiLambda,
        //       inputs: [sourceOutput],
        //     }),
        //   ],
        // },
      ],
    });

    // Outputs
    // new cdk.CfnOutput(this, 'ApiUrl', {
    //   value: api.url,
    // });

    new cdk.CfnOutput(this, 'SourceBucketName', {
      value: sourceBucket.bucketName,
    });

    // new cdk.CfnOutput(this, 'LambdaFunctionName', {
    //   value: apiLambda.functionName,
    // });
  }
}