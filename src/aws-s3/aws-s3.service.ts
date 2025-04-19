import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';

@Injectable()
export class AwsS3Service {
  constructor(private readonly configService: ConfigService) {}

  private readonly bucketName =
    this.configService.get<string>('AWS_BUCKET_NAME');
  private readonly bucketRegion =
    this.configService.get<string>('AWS_BUCKET_REGION');
  private readonly accessKey = this.configService.get<string>('AWS_ACCESS_KEY');
  private readonly secretKey = this.configService.get<string>('AWS_SECRET_KEY');

  private s3 = new S3Client({
    region: this.bucketRegion,
    credentials: {
      accessKeyId: this.accessKey,
      secretAccessKey: this.secretKey,
    },
  });

  async uploadFile(file: Express.Multer.File, folder = 'uploads') {
    const key = `${folder}/${randomUUID()}-${file.originalname}`;
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await this.s3.send(command);

    return key;
  }

  async deleteFile(key: string) {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );
  }

  async getFileStream(key: string) {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    const response = await this.s3.send(command);

    return response.Body as Readable;
  }
}
