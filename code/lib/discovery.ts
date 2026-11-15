import { notFound } from "next/navigation";
import { openDiscoveryDatabase } from "../modules/discovery/database";
import { DiscoveryRepository } from "../modules/discovery/repository";
import { parseRuntimeConfig } from "../modules/runtime/runtime-config";

let repository: DiscoveryRepository | undefined;
export function getDiscoveryRepository(): DiscoveryRepository {
  if (parseRuntimeConfig(process.env).mode !== "cloud")
    throw new Error("资讯需要云端模式。");
  repository ??= new DiscoveryRepository(openDiscoveryDatabase());
  return repository;
}
export function requireDiscovery(): DiscoveryRepository {
  if (parseRuntimeConfig(process.env).mode !== "cloud") notFound();
  return getDiscoveryRepository();
}
