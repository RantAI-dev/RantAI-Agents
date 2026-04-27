# S3 Lifecycle Policy — artifact preview cache

The text/document script-based pipeline caches per-page PNG previews under
`s3://<bucket>/artifact-preview/<artifactId>/<contentHash>/page-N.png`. Each
edit creates a new contentHash, so old hashes orphan over time. We rely on
an S3 lifecycle rule to age them out.

## AWS CLI

```bash
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration '{
  "Rules": [{
    "ID": "expire-artifact-preview-after-30d",
    "Status": "Enabled",
    "Filter": { "Prefix": "artifact-preview/" },
    "Expiration": { "Days": 30 }
  }]
}'
```

Active artifacts are re-rendered (and re-cached with a new LastModified) on
every panel mount, so anything currently used gets a fresh expiry; only truly
stale entries age out.

## MinIO / R2

Apply the equivalent lifecycle configuration via the provider's UI or CLI.
Same prefix (`artifact-preview/`) and 30-day expiration.
