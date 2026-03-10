import boto3
import os
from django.conf import settings
from botocore.exceptions import ClientError

def get_s3_client():
    return boto3.client(
        's3',
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_S3_REGION_NAME
    )

def upload_to_s3(file_data, object_name):
    """
    Uploads file data to an S3 bucket.
    """
    s3_client = get_s3_client()
    try:
        s3_client.put_object(
            Bucket=settings.AWS_STORAGE_BUCKET_NAME,
            Key=object_name,
            Body=file_data
        )
        return f"s3://{settings.AWS_STORAGE_BUCKET_NAME}/{object_name}"
    except ClientError as e:
        print(f"Error uploading to S3: {e}")
        return None

def download_from_s3(object_name):
    """
    Downloads file data from an S3 bucket.
    """
    s3_client = get_s3_client()
    try:
        response = s3_client.get_object(
            Bucket=settings.AWS_STORAGE_BUCKET_NAME,
            Key=object_name
        )
        return response['Body'].read()
    except ClientError as e:
        print(f"Error downloading from S3: {e}")
        return None
