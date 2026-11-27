variable "name" { type = string }
variable "db_subnet_ids" { type = list(string) }
variable "proxy_subnet_ids" { type = list(string) }
variable "rds_sg_id" { type = string }
variable "rds_proxy_sg_id" { type = string }
variable "env" { type = string }
variable "db_name" {
  type    = string
  default = "graphql_app"
}
variable "db_username" {
  type    = string
  default = "graphql_user"
}