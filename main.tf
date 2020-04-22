variable "yc_cloud" {
  type = string
}

variable "yc_folder" {
  type = string
}

provider "yandex" {
  cloud_id = var.yc_cloud
  folder_id = var.yc_folder
}

data "archive_file" "package" {
  type = "zip"
  output_path = "${path.module}/package.zip"
  source_file = "index.js"
}

resource "yandex_iam_service_account" "vm-backuper" {
  name = "vm-backuper"
}

resource "yandex_resourcemanager_folder_iam_binding" "vm-backuper" {
  folder_id = var.yc_folder

  role = "editor"

  members = [
    "serviceAccount:${yandex_iam_service_account.vm-backuper.id}"
  ]
}
resource "yandex_function" "vm-backuper" {
  name = "vm-backuper"
  runtime = "nodejs12"
  entrypoint = "index.handler"
  memory = "128"
  execution_timeout = "300"
  service_account_id = yandex_iam_service_account.vm-backuper.id
  user_hash = data.archive_file.package.output_sha
  content {
    zip_filename = "package.zip"
  }
}

resource "yandex_function_trigger" "vm-backuper" {
  name = "vm-backuper"
  timer {
    cron_expression = "0 * * * ? *"
  }
  function {
    id = yandex_function.vm-backuper.id
    service_account_id = yandex_iam_service_account.vm-backuper.id
  }
}