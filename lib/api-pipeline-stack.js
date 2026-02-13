"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiPipelineStack = void 0;
const cdk = require("aws-cdk-lib");
const codepipeline = require("aws-cdk-lib/aws-codepipeline");
const codepipeline_actions = require("aws-cdk-lib/aws-codepipeline-actions");
const codebuild = require("aws-cdk-lib/aws-codebuild");
const s3 = require("aws-cdk-lib/aws-s3");
const iam = require("aws-cdk-lib/aws-iam");
// Configuration constants
const CONFIG = {
    PIPELINE_NAME: 'globomantics-pipeline',
    SOURCE_ARCHIVE: 'lambda-api-sam.zip',
    NODEJS_VERSION: 22,
    BUILD_IMAGE: codebuild.LinuxBuildImage.STANDARD_7_0,
    SAM_TEMPLATE: 'template.yaml',
    PACKAGED_TEMPLATE: 'packaged.yaml',
    STACK_NAMES: {
        DEV: 'lambda-api-sam-dev',
        TEST: 'lambda-api-sam-test',
        PROD: 'lambda-api-sam-prod',
    },
    DEPLOYMENT_PREFERENCES: {
        DEV: 'AllAtOnce',
        TEST: 'AllAtOnce',
        PROD: 'Linear10PercentEvery1Minute',
    },
};
class ApiPipelineStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // S3 bucket for source code
        const sourceBucket = this.createSourceBucket();
        // IAM roles
        const codeBuildRole = this.createCodeBuildRole();
        const codePipelineRole = this.createCodePipelineRole();
        // CodeBuild projects
        const samBuildProject = this.createBuildProject(codeBuildRole, sourceBucket);
        const devDeployProject = this.createDeployProject('DevDeployProject', codeBuildRole, sourceBucket, CONFIG.STACK_NAMES.DEV);
        // CodePipeline
        this.createPipeline(codePipelineRole, sourceBucket, samBuildProject, devDeployProject);
        new cdk.CfnOutput(this, 'SourceBucketName', {
            value: sourceBucket.bucketName,
        });
    }
    createSourceBucket() {
        return new s3.Bucket(this, 'SourceBucket', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            versioned: true,
        });
    }
    createCodeBuildRole() {
        return new iam.Role(this, 'CodeBuildRole', {
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
    }
    createCodePipelineRole() {
        return new iam.Role(this, 'CodePipelineRole', {
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
    }
    createBuildProject(role, sourceBucket) {
        return new codebuild.Project(this, 'SamBuildProject', {
            role: role,
            source: codebuild.Source.s3({
                bucket: sourceBucket,
                path: CONFIG.SOURCE_ARCHIVE,
            }),
            buildSpec: codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        'runtime-versions': {
                            nodejs: CONFIG.NODEJS_VERSION,
                        },
                        commands: ['pip install aws-sam-cli'],
                    },
                    build: {
                        commands: [
                            'sam build',
                            `sam package --template-file ${CONFIG.SAM_TEMPLATE} --s3-bucket ${sourceBucket.bucketName} --output-template-file ${CONFIG.PACKAGED_TEMPLATE}`,
                        ],
                    },
                },
                artifacts: {
                    files: ['**/*'],
                },
            }),
            environment: {
                buildImage: CONFIG.BUILD_IMAGE,
                privileged: true,
            },
        });
    }
    createDeployProject(id, role, sourceBucket, stackName, deploymentPreference) {
        const deployCommand = deploymentPreference
            ? `sam deploy --template-file ${CONFIG.PACKAGED_TEMPLATE} --stack-name ${stackName} --s3-bucket ${sourceBucket.bucketName} --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset --parameter-overrides DeploymentPreferenceType=${deploymentPreference}`
            : `sam deploy --template-file ${CONFIG.PACKAGED_TEMPLATE} --stack-name ${stackName} --s3-bucket ${sourceBucket.bucketName} --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset`;
        return new codebuild.Project(this, id, {
            role: role,
            buildSpec: codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        'runtime-versions': {
                            nodejs: CONFIG.NODEJS_VERSION,
                        },
                        commands: ['pip install aws-sam-cli'],
                    },
                    build: {
                        commands: [deployCommand],
                    },
                },
            }),
            environment: {
                buildImage: CONFIG.BUILD_IMAGE,
                privileged: true,
            },
        });
    }
    createPipeline(role, sourceBucket, buildProject, devDeployProject) {
        const sourceOutput = new codepipeline.Artifact();
        const buildOutput = new codepipeline.Artifact();
        const stages = [
            this.createSourceStage(sourceBucket, sourceOutput),
            this.createBuildStage(buildProject, sourceOutput, buildOutput),
            this.createDeployStage('Dev', 'DeployToDev', devDeployProject, buildOutput)
        ];
        return new codepipeline.Pipeline(this, 'Pipeline', {
            pipelineName: CONFIG.PIPELINE_NAME,
            role: role,
            stages: stages,
        });
    }
    createSourceStage(sourceBucket, output) {
        return {
            stageName: 'Source',
            actions: [
                new codepipeline_actions.S3SourceAction({
                    actionName: 'S3Source',
                    bucket: sourceBucket,
                    bucketKey: CONFIG.SOURCE_ARCHIVE,
                    output: output,
                    trigger: codepipeline_actions.S3Trigger.EVENTS,
                }),
            ],
        };
    }
    createBuildStage(project, input, output) {
        return {
            stageName: 'Build',
            actions: [
                new codepipeline_actions.CodeBuildAction({
                    actionName: 'SamBuild',
                    project: project,
                    input: input,
                    outputs: [output],
                }),
            ],
        };
    }
    createApprovalStage(stageName, actionName) {
        return {
            stageName: stageName,
            actions: [
                new codepipeline_actions.ManualApprovalAction({
                    actionName: actionName,
                }),
            ],
        };
    }
    createDeployStage(stageName, actionName, project, input) {
        return {
            stageName: stageName,
            actions: [
                new codepipeline_actions.CodeBuildAction({
                    actionName: actionName,
                    project: project,
                    input: input,
                }),
            ],
        };
    }
}
exports.ApiPipelineStack = ApiPipelineStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLXBpcGVsaW5lLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXBpLXBpcGVsaW5lLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUNuQyw2REFBNkQ7QUFDN0QsNkVBQTZFO0FBQzdFLHVEQUF1RDtBQUN2RCx5Q0FBeUM7QUFDekMsMkNBQTJDO0FBRzNDLDBCQUEwQjtBQUMxQixNQUFNLE1BQU0sR0FBRztJQUNiLGFBQWEsRUFBRSx1QkFBdUI7SUFDdEMsY0FBYyxFQUFFLG9CQUFvQjtJQUNwQyxjQUFjLEVBQUUsRUFBRTtJQUNsQixXQUFXLEVBQUUsU0FBUyxDQUFDLGVBQWUsQ0FBQyxZQUFZO0lBQ25ELFlBQVksRUFBRSxlQUFlO0lBQzdCLGlCQUFpQixFQUFFLGVBQWU7SUFDbEMsV0FBVyxFQUFFO1FBQ1gsR0FBRyxFQUFFLG9CQUFvQjtRQUN6QixJQUFJLEVBQUUscUJBQXFCO1FBQzNCLElBQUksRUFBRSxxQkFBcUI7S0FDNUI7SUFDRCxzQkFBc0IsRUFBRTtRQUN0QixHQUFHLEVBQUUsV0FBVztRQUNoQixJQUFJLEVBQUUsV0FBVztRQUNqQixJQUFJLEVBQUUsNkJBQTZCO0tBQ3BDO0NBQ0YsQ0FBQztBQUVGLE1BQWEsZ0JBQWlCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDN0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFzQjtRQUM5RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4Qiw0QkFBNEI7UUFDNUIsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7UUFFL0MsWUFBWTtRQUNaLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1FBQ2pELE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUM7UUFFdkQscUJBQXFCO1FBQ3JCLE1BQU0sZUFBZSxHQUFH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O29CQUNoQyxNQUFNLEVBQUUsTUFBTTtvQkFDZCxPQUFPLEVBQUUsb0JBQW9CLENBQUMsU0FBUyxDQUFDLE1BQU07aUJBQy9DLENBQUM7YUFDSDtTQUNGLENBQUM7SUFDSixDQUFDO0lBRU8sZ0JBQWdCLENBQ3RCLE9BQTBCLEVBQzFCLEtBQTRCLEVBQzVCLE1BQTZCO1FBRTdCLE9BQU87WUFDTCxTQUFTLEVBQUUsT0FBTztZQUNsQixPQUFPLEVBQUU7Z0JBQ1AsSUFBSSxvQkFBb0IsQ0FBQyxlQUFlLENBQUM7b0JBQ3ZDLFVBQVUsRUFBRSxVQUFVO29CQUN0QixPQUFPLEVBQUUsT0FBTztvQkFDaEIsS0FBSyxFQUFFLEtBQUs7b0JBQ1osT0FBTyxFQUFFLENBQUMsTUFBTSxDQUFDO2lCQUNsQixDQUFDO2FBQ0g7U0FDRixDQUFDO0lBQ0osQ0FBQztJQUVPLG1CQUFtQixDQUFDLFNBQWlCLEVBQUUsVUFBa0I7UUFDL0QsT0FBTztZQUNMLFNBQVMsRUFBRSxTQUFTO1lBQ3BCLE9BQU8sRUFBRTtnQkFDUCxJQUFJLG9CQUFvQixDQUFDLG9CQUFvQixDQUFDO29CQUM1QyxVQUFVLEVBQUUsVUFBVTtpQkFDdkIsQ0FBQzthQUNIO1NBQ0YsQ0FBQztJQUNKLENBQUM7SUFFTyxpQkFBaUIsQ0FDdkIsU0FBaUIsRUFDakIsVUFBa0IsRUFDbEIsT0FBMEIsRUFDMUIsS0FBNEI7UUFFNUIsT0FBTztZQUNMLFNBQVMsRUFBRSxTQUFTO1lBQ3BCLE9BQU8sRUFBRTtnQkFDUCxJQUFJLG9CQUFvQixDQUFDLGVBQWUsQ0FBQztvQkFDdkMsVUFBVSxFQUFFLFVBQVU7b0JBQ3RCLE9BQU8sRUFBRSxPQUFPO29CQUNoQixLQUFLLEVBQUUsS0FBSztpQkFDYixDQUFDO2FBQ0g7U0FDRixDQUFDO0lBQ0osQ0FBQztDQUNGO0FBdk9ELDRDQXVPQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBjb2RlcGlwZWxpbmUgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZGVwaXBlbGluZSc7XG5pbXBvcnQgKiBhcyBjb2RlcGlwZWxpbmVfYWN0aW9ucyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29kZXBpcGVsaW5lLWFjdGlvbnMnO1xuaW1wb3J0ICogYXMgY29kZWJ1aWxkIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2RlYnVpbGQnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG4vLyBDb25maWd1cmF0aW9uIGNvbnN0YW50c1xuY29uc3QgQ09ORklHID0ge1xuICBQSVBFTElORV9OQU1FOiAnZ2xvYm9tYW50aWNzLXBpcGVsaW5lJyxcbiAgU09VUkNFX0FSQ0hJVkU6ICdsYW1iZGEtYXBpLXNhbS56aXAnLFxuICBOT0RFSlNfVkVSU0lPTjogMjIsXG4gIEJVSUxEX0lNQUdFOiBjb2RlYnVpbGQuTGludXhCdWlsZEltYWdlLlNUQU5EQVJEXzdfMCxcbiAgU0FNX1RFTVBMQVRFOiAndGVtcGxhdGUueWFtbCcsXG4gIFBBQ0tBR0VEX1RFTVBMQVRFOiAncGFja2FnZWQueWFtbCcsXG4gIFNUQUNLX05BTUVTOiB7XG4gICAgREVWOiAnbGFtYmRhLWFwaS1zYW0tZGV2JyxcbiAgICBURVNUOiAnbGFtYmRhLWFwaS1zYW0tdGVzdCcsXG4gICAgUFJPRDogJ2xhbWJkYS1hcGktc2FtLXByb2QnLFxuICB9LFxuICBERVBMT1lNRU5UX1BSRUZFUkVOQ0VTOiB7XG4gICAgREVWOiAnQWxsQXRPbmNlJyxcbiAgICBURVNUOiAnQWxsQXRPbmNlJyxcbiAgICBQUk9EOiAnTGluZWFyMTBQZXJjZW50RXZlcnkxTWludXRlJyxcbiAgfSxcbn07XG5cbmV4cG9ydCBjbGFzcyBBcGlQaXBlbGluZVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gUzMgYnVja2V0IGZvciBzb3VyY2UgY29kZVxuICAgIGNvbnN0IHNvdXJjZUJ1Y2tldCA9IHRoaXMuY3JlYXRlU291cmNlQnVja2V0KCk7XG5cbiAgICAvLyBJQU0gcm9sZXNcbiAgICBjb25zdCBjb2RlQnVpbGRSb2xlID0gdGhpcy5jcmVhdGVDb2RlQnVpbGRSb2xlKCk7XG4gICAgY29uc3QgY29kZVBpcGVsaW5lUm9sZSA9IHRoaXMuY3JlYXRlQ29kZVBpcGVsaW5lUm9sZSgpO1xuXG4gICAgLy8gQ29kZUJ1aWxkIHByb2plY3RzXG4gICAgY29uc3Qgc2FtQnVpbGRQcm9qZWN0ID0gdGhpcy5jcmVhdGVCdWlsZFByb2plY3QoY29kZUJ1aWxkUm9sZSwgc291cmNlQnVja2V0KTtcbiAgICBjb25zdCBkZXZEZXBsb3lQcm9qZWN0ID0gdGhpcy5jcmVhdGVEZXBsb3lQcm9qZWN0KCdEZXZEZXBsb3lQcm9qZWN0JywgY29kZUJ1aWxkUm9sZSwgc291cmNlQnVja2V0LCBDT05GSUcuU1RBQ0tfTkFNRVMuREVWKTtcbiAgICBcbiAgICAvLyBDb2RlUGlwZWxpbmVcbiAgICB0aGlzLmNyZWF0ZVBpcGVsaW5lKGNvZGVQaXBlbGluZVJvbGUsIHNvdXJjZUJ1Y2tldCwgc2FtQnVpbGRQcm9qZWN0LCBkZXZEZXBsb3lQcm9qZWN0KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTb3VyY2VCdWNrZXROYW1lJywge1xuICAgICAgdmFsdWU6IHNvdXJjZUJ1Y2tldC5idWNrZXROYW1lLFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVTb3VyY2VCdWNrZXQoKTogczMuQnVja2V0IHtcbiAgICByZXR1cm4gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnU291cmNlQnVja2V0Jywge1xuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlQ29kZUJ1aWxkUm9sZSgpOiBpYW0uUm9sZSB7XG4gICAgcmV0dXJuIG5ldyBpYW0uUm9sZSh0aGlzLCAnQ29kZUJ1aWxkUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdjb2RlYnVpbGQuYW1hem9uYXdzLmNvbScpLFxuICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgQ29kZUJ1aWxkUG9saWN5OiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdsb2dzOkNyZWF0ZUxvZ0dyb3VwJyxcbiAgICAgICAgICAgICAgICAnbG9nczpDcmVhdGVMb2dTdHJlYW0nLFxuICAgICAgICAgICAgICAgICdsb2dzOlB1dExvZ0V2ZW50cycsXG4gICAgICAgICAgICAgICAgJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ3MzOlB1dE9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOionLFxuICAgICAgICAgICAgICAgICdsYW1iZGE6KicsXG4gICAgICAgICAgICAgICAgJ2FwaWdhdGV3YXk6KicsXG4gICAgICAgICAgICAgICAgJ2lhbToqJyxcbiAgICAgICAgICAgICAgICAnY29kZWRlcGxveToqJ1xuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVDb2RlUGlwZWxpbmVSb2xlKCk6IGlhbS5Sb2xlIHtcbiAgICByZXR1cm4gbmV3IGlhbS5Sb2xlKHRoaXMsICdDb2RlUGlwZWxpbmVSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2NvZGVwaXBlbGluZS5hbWF6b25hd3MuY29tJyksXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBDb2RlUGlwZWxpbmVQb2xpY3k6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ3MzOlB1dE9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ2NvZGVidWlsZDpCYXRjaEdldEJ1aWxkcycsXG4gICAgICAgICAgICAgICAgJ2NvZGVidWlsZDpTdGFydEJ1aWxkJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlQnVpbGRQcm9qZWN0KHJvbGU6IGlhbS5Sb2xlLCBzb3VyY2VCdWNrZXQ6IHMzLkJ1Y2tldCk6IGNvZGVidWlsZC5Qcm9qZWN0IHtcbiAgICByZXR1cm4gbmV3IGNvZGVidWlsZC5Qcm9qZWN0KHRoaXMsICdTYW1CdWlsZFByb2plY3QnLCB7XG4gICAgICByb2xlOiByb2xlLFxuICAgICAgc291cmNlOiBjb2RlYnVpbGQuU291cmNlLnMzKHtcbiAgICAgICAgYnVja2V0OiBzb3VyY2VCdWNrZXQsXG4gICAgICAgIHBhdGg6IENPTkZJRy5TT1VSQ0VfQVJDSElWRSxcbiAgICAgIH0pLFxuICAgICAgYnVpbGRTcGVjOiBjb2RlYnVpbGQuQnVpbGRTcGVjLmZyb21PYmplY3Qoe1xuICAgICAgICB2ZXJzaW9uOiAnMC4yJyxcbiAgICAgICAgcGhhc2VzOiB7XG4gICAgICAgICAgaW5zdGFsbDoge1xuICAgICAgICAgICAgJ3J1bnRpbWUtdmVyc2lvbnMnOiB7XG4gICAgICAgICAgICAgIG5vZGVqczogQ09ORklHLk5PREVKU19WRVJTSU9OLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGNvbW1hbmRzOiBbJ3BpcCBpbnN0YWxsIGF3cy1zYW0tY2xpJ10sXG4gICAgICAgICAgfSxcbiAgICAgICAgICBidWlsZDoge1xuICAgICAgICAgICAgY29tbWFuZHM6IFtcbiAgICAgICAgICAgICAgJ3NhbSBidWlsZCcsXG4gICAgICAgICAgICAgIGBzYW0gcGFja2FnZSAtLXRlbXBsYXRlLWZpbGUgJHtDT05GSUcuU0FNX1RFTVBMQVRFfSAtLXMzLWJ1Y2tldCAke3NvdXJjZUJ1Y2tldC5idWNrZXROYW1lfSAtLW91dHB1dC10ZW1wbGF0ZS1maWxlICR7Q09ORklHLlBBQ0tBR0VEX1RFTVBMQVRFfWAsXG4gICAgICAgICAgICBdLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIGFydGlmYWN0czoge1xuICAgICAgICAgIGZpbGVzOiBbJyoqLyonXSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgYnVpbGRJbWFnZTogQ09ORklHLkJVSUxEX0lNQUdFLFxuICAgICAgICBwcml2aWxlZ2VkOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlRGVwbG95UHJvamVjdChcbiAgICBpZDogc3RyaW5nLFxuICAgIHJvbGU6IGlhbS5Sb2xlLFxuICAgIHNvdXJjZUJ1Y2tldDogczMuQnVja2V0LFxuICAgIHN0YWNrTmFtZTogc3RyaW5nLFxuICAgIGRlcGxveW1lbnRQcmVmZXJlbmNlPzogc3RyaW5nXG4gICk6IGNvZGVidWlsZC5Qcm9qZWN0IHtcbiAgICBjb25zdCBkZXBsb3lDb21tYW5kID0gZGVwbG95bWVudFByZWZlcmVuY2VcbiAgICAgID8gYHNhbSBkZXBsb3kgLS10ZW1wbGF0ZS1maWxlICR7Q09ORklHLlBBQ0tBR0VEX1RFTVBMQVRFfSAtLXN0YWNrLW5hbWUgJHtzdGFja05hbWV9IC0tczMtYnVja2V0ICR7c291cmNlQnVja2V0LmJ1Y2tldE5hbWV9IC0tY2FwYWJpbGl0aWVzIENBUEFCSUxJVFlfSUFNIC0tbm8tZmFpbC1vbi1lbXB0eS1jaGFuZ2VzZXQgLS1wYXJhbWV0ZXItb3ZlcnJpZGVzIERlcGxveW1lbnRQcmVmZXJlbmNlVHlwZT0ke2RlcGxveW1lbnRQcmVmZXJlbmNlfWBcbiAgICAgIDogYHNhbSBkZXBsb3kgLS10ZW1wbGF0ZS1maWxlICR7Q09ORklHLlBBQ0tBR0VEX1RFTVBMQVRFfSAtLXN0YWNrLW5hbWUgJHtzdGFja05hbWV9IC0tczMtYnVja2V0ICR7c291cmNlQnVja2V0LmJ1Y2tldE5hbWV9IC0tY2FwYWJpbGl0aWVzIENBUEFCSUxJVFlfSUFNIC0tbm8tZmFpbC1vbi1lbXB0eS1jaGFuZ2VzZXRgO1xuXG4gICAgcmV0dXJuIG5ldyBjb2RlYnVpbGQuUHJvamVjdCh0aGlzLCBpZCwge1xuICAgICAgcm9sZTogcm9sZSxcbiAgICAgIGJ1aWxkU3BlYzogY29kZWJ1aWxkLkJ1aWxkU3BlYy5mcm9tT2JqZWN0KHtcbiAgICAgICAgdmVyc2lvbjogJzAuMicsXG4gICAgICAgIHBoYXNlczoge1xuICAgICAgICAgIGluc3RhbGw6IHtcbiAgICAgICAgICAgICdydW50aW1lLXZlcnNpb25zJzoge1xuICAgICAgICAgICAgICBub2RlanM6IENPTkZJRy5OT0RFSlNfVkVSU0lPTixcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBjb21tYW5kczogWydwaXAgaW5zdGFsbCBhd3Mtc2FtLWNsaSddLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgYnVpbGQ6IHtcbiAgICAgICAgICAgIGNvbW1hbmRzOiBbZGVwbG95Q29tbWFuZF0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgYnVpbGRJbWFnZTogQ09ORklHLkJVSUxEX0lNQUdFLFxuICAgICAgICBwcml2aWxlZ2VkOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlUGlwZWxpbmUoXG4gICAgcm9sZTogaWFtLlJvbGUsXG4gICAgc291cmNlQnVja2V0OiBzMy5CdWNrZXQsXG4gICAgYnVpbGRQcm9qZWN0OiBjb2RlYnVpbGQuUHJvamVjdCxcbiAgICBkZXZEZXBsb3lQcm9qZWN0OiBjb2RlYnVpbGQuUHJvamVjdFxuICApOiBjb2RlcGlwZWxpbmUuUGlwZWxpbmUge1xuICAgIGNvbnN0IHNvdXJjZU91dHB1dCA9IG5ldyBjb2RlcGlwZWxpbmUuQXJ0aWZhY3QoKTtcbiAgICBjb25zdCBidWlsZE91dHB1dCA9IG5ldyBjb2RlcGlwZWxpbmUuQXJ0aWZhY3QoKTtcblxuICAgIGNvbnN0IHN0YWdlcyA9IFtcbiAgICAgIHRoaXMuY3JlYXRlU291cmNlU3RhZ2Uoc291cmNlQnVja2V0LCBzb3VyY2VPdXRwdXQpLFxuICAgICAgdGhpcy5jcmVhdGVCdWlsZFN0YWdlKGJ1aWxkUHJvamVjdCwgc291cmNlT3V0cHV0LCBidWlsZE91dHB1dCksXG4gICAgICB0aGlzLmNyZWF0ZURlcGxveVN0YWdlKCdEZXYnLCAnRGVwbG95VG9EZXYnLCBkZXZEZXBsb3lQcm9qZWN0LCBidWlsZE91dHB1dClcbiAgICBdO1xuXG4gICAgcmV0dXJuIG5ldyBjb2RlcGlwZWxpbmUuUGlwZWxpbmUodGhpcywgJ1BpcGVsaW5lJywge1xuICAgICAgcGlwZWxpbmVOYW1lOiBDT05GSUcuUElQRUxJTkVfTkFNRSxcbiAgICAgIHJvbGU6IHJvbGUsXG4gICAgICBzdGFnZXM6IHN0YWdlcyxcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlU291cmNlU3RhZ2Uoc291cmNlQnVja2V0OiBzMy5CdWNrZXQsIG91dHB1dDogY29kZXBpcGVsaW5lLkFydGlmYWN0KTogY29kZXBpcGVsaW5lLlN0YWdlUHJvcHMge1xuICAgIHJldHVybiB7XG4gICAgICBzdGFnZU5hbWU6ICdTb3VyY2UnLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICBuZXcgY29kZXBpcGVsaW5lX2FjdGlvbnMuUzNTb3VyY2VBY3Rpb24oe1xuICAgICAgICAgIGFjdGlvbk5hbWU6ICdTM1NvdXJjZScsXG4gICAgICAgICAgYnVja2V0OiBzb3VyY2VCdWNrZXQsXG4gICAgICAgICAgYnVja2V0S2V5OiBDT05GSUcuU09VUkNFX0FSQ0hJVkUsXG4gICAgICAgICAgb3V0cHV0OiBvdXRwdXQsXG4gICAgICAgICAgdHJpZ2dlcjogY29kZXBpcGVsaW5lX2FjdGlvbnMuUzNUcmlnZ2VyLkVWRU5UUyxcbiAgICAgICAgfSksXG4gICAgICBdLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZUJ1aWxkU3RhZ2UoXG4gICAgcHJvamVjdDogY29kZWJ1aWxkLlByb2plY3QsXG4gICAgaW5wdXQ6IGNvZGVwaXBlbGluZS5BcnRpZmFjdCxcbiAgICBvdXRwdXQ6IGNvZGVwaXBlbGluZS5BcnRpZmFjdFxuICApOiBjb2RlcGlwZWxpbmUuU3RhZ2VQcm9wcyB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YWdlTmFtZTogJ0J1aWxkJyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgbmV3IGNvZGVwaXBlbGluZV9hY3Rpb25zLkNvZGVCdWlsZEFjdGlvbih7XG4gICAgICAgICAgYWN0aW9uTmFtZTogJ1NhbUJ1aWxkJyxcbiAgICAgICAgICBwcm9qZWN0OiBwcm9qZWN0LFxuICAgICAgICAgIGlucHV0OiBpbnB1dCxcbiAgICAgICAgICBvdXRwdXRzOiBbb3V0cHV0XSxcbiAgICAgICAgfSksXG4gICAgICBdLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZUFwcHJvdmFsU3RhZ2Uoc3RhZ2VOYW1lOiBzdHJpbmcsIGFjdGlvbk5hbWU6IHN0cmluZyk6IGNvZGVwaXBlbGluZS5TdGFnZVByb3BzIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhZ2VOYW1lOiBzdGFnZU5hbWUsXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgIG5ldyBjb2RlcGlwZWxpbmVfYWN0aW9ucy5NYW51YWxBcHByb3ZhbEFjdGlvbih7XG4gICAgICAgICAgYWN0aW9uTmFtZTogYWN0aW9uTmFtZSxcbiAgICAgICAgfSksXG4gICAgICBdLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZURlcGxveVN0YWdlKFxuICAgIHN0YWdlTmFtZTogc3RyaW5nLFxuICAgIGFjdGlvbk5hbWU6IHN0cmluZyxcbiAgICBwcm9qZWN0OiBjb2RlYnVpbGQuUHJvamVjdCxcbiAgICBpbnB1dDogY29kZXBpcGVsaW5lLkFydGlmYWN0XG4gICk6IGNvZGVwaXBlbGluZS5TdGFnZVByb3BzIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhZ2VOYW1lOiBzdGFnZU5hbWUsXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgIG5ldyBjb2RlcGlwZWxpbmVfYWN0aW9ucy5Db2RlQnVpbGRBY3Rpb24oe1xuICAgICAgICAgIGFjdGlvbk5hbWU6IGFjdGlvbk5hbWUsXG4gICAgICAgICAgcHJvamVjdDogcHJvamVjdCxcbiAgICAgICAgICBpbnB1dDogaW5wdXQsXG4gICAgICAgIH0pLFxuICAgICAgXSxcbiAgICB9O1xuICB9XG59XG4iXX0=