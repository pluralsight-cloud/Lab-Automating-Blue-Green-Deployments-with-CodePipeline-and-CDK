# CDK API Gateway + Lambda + CodePipeline

This CDK application deploys an API Gateway REST API with Lambda function. CodePipeline automatically updates Lambda code when you upload to S3.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Deploy infrastructure:
```bash
npm run build
cdk bootstrap
cdk deploy
```

3. Package and upload Lambda code to trigger pipeline:
   
   **Create source.zip with required files:**
   ```bash
   cd lambda
   zip ../source.zip index.js package.json
   cd ..
   ```
   
   **Upload to S3 source bucket:**
   ```bash
   aws s3 cp source.zip s3://apipipelinestack-sourcebucketddd2130a-fhjf2omdx8s2/source.zip
   ```
   
   The pipeline triggers automatically and deploys the updated Lambda function.

## Architecture

- **Lambda Function**: Node.js function returning JSON response
- **API Gateway**: REST API with GET method
- **CodePipeline**: 2-stage pipeline (S3 Source → Deploy Lambda)
- **S3 Source**: Pipeline triggers on source.zip upload

## API Endpoint

After deployment, test with:
```bash
curl <API_URL>
```