variable "name" { type = string }
variable "env" { type = string }
variable "region" { type = string }
variable "vpc_id" { type = string }
variable "app_subnet_ids" { type = list(string) }
variable "alb_sg_id" { type = string }
variable "ecs_sg_id" { type = string }
variable "image" { type = string }
variable "cpu" {
  type    = number
  default = 256
}
variable "memory" {
  type    = number
  default = 512
}
variable "min_tasks" {
  type    = number
  default = 1
}
variable "max_tasks" {
  type    = number
  default = 4
}