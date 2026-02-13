"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiPipelineStack = void 0;
const cdk = require("aws-cdk-lib");
const codepipeline = require("aws-cdk-lib/aws-codepipeline");
const codepipeline_actions = require("aws-cdk-lib/aws-codepipeline-actions");
const codebuild = require("aws-cdk-lib/aws-codebuild");
const s3 = require("aws-cdk-lib/aws-s3");
const iam = require("aws-cdk-lib/aws-iam");
class ApiPipelineStack extends cdk.Stack {
    constructor(scope, id, props) {
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
                                'codedeploy:*'
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
exports.ApiPipelineStack = ApiPipelineStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLXBpcGVsaW5lLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXBpLXBpcGVsaW5lLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUduQyw2REFBNkQ7QUFDN0QsNkVBQTZFO0FBQzdFLHVEQUF1RDtBQUN2RCx5Q0FBeUM7QUFDekMsMkNBQTJDO0FBRzNDLE1BQWEsZ0JBQWlCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDN0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFzQjtRQUM5RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4Qiw0QkFBNEI7UUFDNUIsTUFBTSxZQUFZLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxjQUFjLEVBQUU7WUFDdkQsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztZQUN4QyxTQUFTLEVBQUUsSUFBSTtTQUNoQixDQUFDLENBQUM7UUFFSCxZQUFZO1FBQ1osTUFBTSxhQUFhLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDeEQsU0FBUyxFQUFFLElBQUksR0FBRyxDQUFDLGdCQUFnQixDQUFDLHlCQUF5QixDQUFDO1lBQzlELGNBQWMsRUFBRTtnQkFDZCxlQUFlLEVBQUUsSUFBSSxHQUFHLENBQUMsY0FBYyxDQUFDO29CQUN0QyxVQUFVLEVBQUU7d0JBQ1YsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDOzRCQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLOzRCQUN4QixPQUFPLEVBQUU7Z0NBQ1AscUJBQXFCO2dDQUNyQixzQkFBc0I7Z0NBQ3RCLG1CQUFtQjtnQ0FDbkIsY0FBYztnQ0FDZCxjQUFjO2dDQUNkLGtCQUFrQjtnQ0FDbEIsVUFBVTtnQ0FDVixjQUFjO2dDQUNkLE9BQU87Z0NBQ1AsY0FBYzs2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S0FBSyxFQUFFLFlBQVk7eUJBQ3BCLENBQUM7cUJBQ0g7aUJBQ0Y7Z0JBQ0QsSUFBSTtnQkFDSix5QkFBeUI7Z0JBQ3pCLGVBQWU7Z0JBQ2YsOERBQThEO2dCQUM5RCxvQ0FBb0M7Z0JBQ3BDLDJCQUEyQjtnQkFDM0IsZ0NBQWdDO2dCQUNoQyxVQUFVO2dCQUNWLE9BQU87Z0JBQ1AsS0FBSzthQUNOO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsVUFBVTtRQUNWLHNDQUFzQztRQUN0QyxvQkFBb0I7UUFDcEIsTUFBTTtRQUVOLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDMUMsS0FBSyxFQUFFLFlBQVksQ0FBQyxVQUFVO1NBQy9CLENBQUMsQ0FBQztRQUVILGtEQUFrRDtRQUNsRCxtQ0FBbUM7UUFDbkMsTUFBTTtJQUNSLENBQUM7Q0FDRjtBQXRKRCw0Q0FzSkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheSc7XG5pbXBvcnQgKiBhcyBjb2RlcGlwZWxpbmUgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZGVwaXBlbGluZSc7XG5pbXBvcnQgKiBhcyBjb2RlcGlwZWxpbmVfYWN0aW9ucyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29kZXBpcGVsaW5lLWFjdGlvbnMnO1xuaW1wb3J0ICogYXMgY29kZWJ1aWxkIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2RlYnVpbGQnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5leHBvcnQgY2xhc3MgQXBpUGlwZWxpbmVTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIFMzIGJ1Y2tldCBmb3Igc291cmNlIGNvZGVcbiAgICBjb25zdCBzb3VyY2VCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdTb3VyY2VCdWNrZXQnLCB7XG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gSUFNIHJvbGVzXG4gICAgY29uc3QgY29kZUJ1aWxkUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnQ29kZUJ1aWxkUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdjb2RlYnVpbGQuYW1hem9uYXdzLmNvbScpLFxuICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgQ29kZUJ1aWxkUG9saWN5OiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdsb2dzOkNyZWF0ZUxvZ0dyb3VwJyxcbiAgICAgICAgICAgICAgICAnbG9nczpDcmVhdGVMb2dTdHJlYW0nLFxuICAgICAgICAgICAgICAgICdsb2dzOlB1dExvZ0V2ZW50cycsXG4gICAgICAgICAgICAgICAgJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ3MzOlB1dE9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOionLFxuICAgICAgICAgICAgICAgICdsYW1iZGE6KicsXG4gICAgICAgICAgICAgICAgJ2FwaWdhdGV3YXk6KicsXG4gICAgICAgICAgICAgICAgJ2lhbToqJyxcbiAgICAgICAgICAgICAgICAnY29kZWRlcGxveToqJ1xuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgY29kZVBpcGVsaW5lUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnQ29kZVBpcGVsaW5lUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdjb2RlcGlwZWxpbmUuYW1hem9uYXdzLmNvbScpLFxuICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgQ29kZVBpcGVsaW5lUG9saWN5OiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdzMzpHZXRPYmplY3QnLFxuICAgICAgICAgICAgICAgICdzMzpQdXRPYmplY3QnLFxuICAgICAgICAgICAgICAgICdjb2RlYnVpbGQ6QmF0Y2hHZXRCdWlsZHMnLFxuICAgICAgICAgICAgICAgICdjb2RlYnVpbGQ6U3RhcnRCdWlsZCcsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDb2RlQnVpbGQgcHJvamVjdCBmb3IgU0FNIGRlcGxveW1lbnRcbiAgICBjb25zdCBzYW1CdWlsZFByb2plY3QgPSBuZXcgY29kZWJ1aWxkLlByb2plY3QodGhpcywgJ1NhbUJ1aWxkUHJvamVjdCcsIHtcbiAgICAgIHJvbGU6IGNvZGVCdWlsZFJvbGUsXG4gICAgICBzb3VyY2U6IGNvZGVidWlsZC5Tb3VyY2UuczMoe1xuICAgICAgICBidWNrZXQ6IHNvdXJjZUJ1Y2tldCxcbiAgICAgICAgcGF0aDogJ2xhbWJkYS1hcGktc2FtLnppcCcsXG4gICAgICB9KSxcbiAgICAgIC8vIGJ1aWxkU3BlYzogY29kZWJ1aWxkLkJ1aWxkU3BlYy5mcm9tU291cmNlRmlsZW5hbWUoJ2J1aWxkc3BlYy55YW1sJyksXG4gICAgICBidWlsZFNwZWM6IGNvZGVidWlsZC5CdWlsZFNwZWMuZnJvbU9iamVjdCh7XG4gICAgICAgIHZlcnNpb246ICcwLjInLFxuICAgICAgICBwaGFzZXM6IHtcbiAgICAgICAgICBpbnN0YWxsOiB7XG4gICAgICAgICAgICAncnVudGltZS12ZXJzaW9ucyc6IHtcbiAgICAgICAgICAgICAgbm9kZWpzOiAyMixcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBjb21tYW5kczogW1xuICAgICAgICAgICAgICAncGlwIGluc3RhbGwgYXdzLXNhbS1jbGknLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGJ1aWxkOiB7XG4gICAgICAgICAgICBjb21tYW5kczogW1xuICAgICAgICAgICAgICAnc2FtIGJ1aWxkJyxcbiAgICAgICAgICAgICAgYHNhbSBwYWNrYWdlIC0tdGVtcGxhdGUtZmlsZSB0ZW1wbGF0ZS55YW1sIC0tczMtYnVja2V0ICR7c291cmNlQnVja2V0LmJ1Y2tldE5hbWV9IC0tb3V0cHV0LXRlbXBsYXRlLWZpbGUgcGFja2FnZWQueWFtbGAsXG4gICAgICAgICAgICAgIGBzYW0gZGVwbG95IC0tdGVtcGxhdGUtZmlsZSBwYWNrYWdlZC55YW1sIC0tc3RhY2stbmFtZSBsYW1iZGEtYXBpLXNhbS1zdGFjayAtLXMzLWJ1Y2tldCAke3NvdXJjZUJ1Y2tldC5idWNrZXROYW1lfSAtLWNhcGFiaWxpdGllcyBDQVBBQklMSVRZX0lBTWAsXG4gICAgICAgICAgICBdLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIGFydGlmYWN0czoge1xuICAgICAgICAgIGZpbGVzOiBbJyoqLyonXSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgYnVpbGRJbWFnZTogY29kZWJ1aWxkLkxpbnV4QnVpbGRJbWFnZS5TVEFOREFSRF83XzAsXG4gICAgICAgIHByaXZpbGVnZWQ6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ29kZVBpcGVsaW5lXG4gICAgY29uc3Qgc291cmNlT3V0cHV0ID0gbmV3IGNvZGVwaXBlbGluZS5BcnRpZmFjdCgpO1xuICAgIGNvbnN0IGJ1aWxkT3V0cHV0ID0gbmV3IGNvZGVwaXBlbGluZS5BcnRpZmFjdCgpO1xuXG4gICAgbmV3IGNvZGVwaXBlbGluZS5QaXBlbGluZSh0aGlzLCAnUGlwZWxpbmUnLCB7XG4gICAgICBwaXBlbGluZU5hbWU6ICdnbG9ib21hbnRpY3MtcGlwZWxpbmUnLFxuICAgICAgcm9sZTogY29kZVBpcGVsaW5lUm9sZSxcbiAgICAgIHN0YWdlczogW1xuICAgICAgICB7XG4gICAgICAgICAgc3RhZ2VOYW1lOiAnU291cmNlJyxcbiAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICBuZXcgY29kZXBpcGVsaW5lX2FjdGlvbnMuUzNTb3VyY2VBY3Rpb24oe1xuICAgICAgICAgICAgICBhY3Rpb25OYW1lOiAnUzNTb3VyY2UnLFxuICAgICAgICAgICAgICBidWNrZXQ6IHNvdXJjZUJ1Y2tldCxcbiAgICAgICAgICAgICAgYnVja2V0S2V5OiAnbGFtYmRhLWFwaS1zYW0uemlwJyxcbiAgICAgICAgICAgICAgb3V0cHV0OiBzb3VyY2VPdXRwdXQsXG4gICAgICAgICAgICAgIHRyaWdnZXI6IGNvZGVwaXBlbGluZV9hY3Rpb25zLlMzVHJpZ2dlci5FVkVOVFMsXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgc3RhZ2VOYW1lOiAnQnVpbGQnLFxuICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgIG5ldyBjb2RlcGlwZWxpbmVfYWN0aW9ucy5Db2RlQnVpbGRBY3Rpb24oe1xuICAgICAgICAgICAgICBhY3Rpb25OYW1lOiAnU2FtQnVpbGREZXBsb3knLFxuICAgICAgICAgICAgICBwcm9qZWN0OiBzYW1CdWlsZFByb2plY3QsXG4gICAgICAgICAgICAgIGlucHV0OiBzb3VyY2VPdXRwdXQsXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdLFxuICAgICAgICB9XG4gICAgICAgIC8vIHtcbiAgICAgICAgLy8gICBzdGFnZU5hbWU6ICdEZXBsb3knLFxuICAgICAgICAvLyAgIGFjdGlvbnM6IFtcbiAgICAgICAgLy8gICAgIG5ldyBjb2RlcGlwZWxpbmVfYWN0aW9ucy5Db2RlRGVwbG95TGFtYmRhRGVwbG95QWN0aW9uKHtcbiAgICAgICAgLy8gICAgICAgYWN0aW9uTmFtZTogJ0RlcGxveUxhbWJkYScsXG4gICAgICAgIC8vICAgICAgIGxhbWJkYTogYXBpTGFtYmRhLFxuICAgICAgICAvLyAgICAgICBpbnB1dHM6IFtzb3VyY2VPdXRwdXRdLFxuICAgICAgICAvLyAgICAgfSksXG4gICAgICAgIC8vICAgXSxcbiAgICAgICAgLy8gfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgLy8gbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaVVybCcsIHtcbiAgICAvLyAgIHZhbHVlOiBhcGkudXJsLFxuICAgIC8vIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1NvdXJjZUJ1Y2tldE5hbWUnLCB7XG4gICAgICB2YWx1ZTogc291cmNlQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgfSk7XG5cbiAgICAvLyBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTGFtYmRhRnVuY3Rpb25OYW1lJywge1xuICAgIC8vICAgdmFsdWU6IGFwaUxhbWJkYS5mdW5jdGlvbk5hbWUsXG4gICAgLy8gfSk7XG4gIH1cbn0iXX0=