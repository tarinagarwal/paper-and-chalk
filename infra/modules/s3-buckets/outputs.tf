output "names" {
  description = "Bucket name by role (originals, yjs-snapshots, assets, exports, thumbnails)."
  value       = { for role, bucket in aws_s3_bucket.this : role => bucket.bucket }
}

output "arns" {
  value = [for bucket in aws_s3_bucket.this : bucket.arn]
}

output "object_arns" {
  description = "arn:aws:s3:::<bucket>/* for each bucket."
  value       = [for bucket in aws_s3_bucket.this : "${bucket.arn}/*"]
}
