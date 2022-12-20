#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cdk = require("aws-cdk-lib");
const athena_sqs_apigw_1 = require("../lib/athena-sqs-apigw");
const app = new cdk.App();
const env = app.node.tryGetContext('env') || 'dev';
new athena_sqs_apigw_1.ApigwAthenaSqsStack(app, 'AthenaSqsApigw-' + env, {
    tags: {
        environment: env,
        stack: 'athena-sqs-apigw'
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxtQ0FBbUM7QUFDbkMsOERBQThEO0FBRTlELE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBQzFCLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssQ0FBQztBQUNuRCxJQUFJLHNDQUFtQixDQUFDLEdBQUcsRUFBRSxpQkFBaUIsR0FBRyxHQUFHLEVBQUU7SUFDbEQsSUFBSSxFQUFFO1FBQ0YsV0FBVyxFQUFFLEdBQUc7UUFDaEIsS0FBSyxFQUFFLGtCQUFrQjtLQUMxQjtDQUNOLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBBcGlnd0F0aGVuYVNxc1N0YWNrIH0gZnJvbSAnLi4vbGliL2F0aGVuYS1zcXMtYXBpZ3cnO1xuXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuY29uc3QgZW52ID0gYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnZW52JykgfHwgJ2Rldic7XG5uZXcgQXBpZ3dBdGhlbmFTcXNTdGFjayhhcHAsICdBdGhlbmFTcXNBcGlndy0nICsgZW52LCB7XG4gICAgdGFnczoge1xuICAgICAgICBlbnZpcm9ubWVudDogZW52LFxuICAgICAgICBzdGFjazogJ2F0aGVuYS1zcXMtYXBpZ3cnXG4gICAgICB9XG59KTtcbiJdfQ==