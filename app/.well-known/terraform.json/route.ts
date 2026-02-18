import { jsonResponse } from "@/lib/api/response";

/**
 * GET /.well-known/terraform.json
 *
 * Terraform service discovery endpoint.
 * ref: https://developer.hashicorp.com/terraform/internals/remote-service-discovery
 */
export async function GET() {
  return jsonResponse({
    "modules.v1": "/v1/modules/",
    "providers.v1": "/v1/providers/",
  });
}
