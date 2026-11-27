variable "name" { type = string }
variable "app_subnet_ids" { type = list(string) }
variable "vpc_link_sg_id" { type = string }
variable "alb_listener_arn" { type = string }