import { create } from "zustand";
import { persist } from "zustand/middleware";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface Organization {
  id: string;
  name: string;
  domain: string;
  website_url?: string;
  industry: string;
  industries?: string[];
  size: string;
  micro_vertical?: string;
  micro_verticals?: string[];
  logo?: string;
  createdAt: string;
}

interface SocialLinks {
  linkedin?: string;
  twitter?: string;
  instagram?: string;
  facebook?: string;
  youtube?: string;
}

interface OrganizationState {
  organization: Organization | null;
  organizations: Organization[];
  loading: boolean;
  error: string | null;
  socialLinks: SocialLinks;
  setOrganization: (org: Organization) => void;
  setOrganizations: (orgs: Organization[]) => void;
  updateOrganization: (updates: Partial<Organization>) => void;
  clearOrganization: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSocialLinks: (links: SocialLinks) => void;
  createOrganization: (data: { name: string; domain: string; industry: string; industries?: string[]; size: string; micro_vertical?: string; micro_verticals?: string[]; website_url?: string }) => Promise<Organization>;
  updateSocialLinks: (orgId: string, links: SocialLinks) => Promise<void>;
  detectSocialPresence: (domain: string) => Promise<SocialLinks>;
  fetchOrganizationByEmail: (email: string) => Promise<Organization | null>;
}

export const useOrganizationStore = create<OrganizationState>()(
  persist(
    (set, get) => ({
      organization: null,
      organizations: [],
      loading: false,
      error: null,
      socialLinks: {},

      setOrganization: (org) => set({ organization: org, error: null }),
      setOrganizations: (orgs) => set({ organizations: orgs }),
      updateOrganization: (updates) =>
        set((state) => ({
          organization: state.organization
            ? { ...state.organization, ...updates }
            : null,
        })),
      clearOrganization: () => set({ organization: null }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),
      setSocialLinks: (links) => set({ socialLinks: links }),

      createOrganization: async (data) => {
        set({ loading: true, error: null });
        try {
          const storedUser = localStorage.getItem("yesboss_user");
          const user = storedUser ? JSON.parse(storedUser) : {};
          
          const response = await fetch(`${API_URL}/organizations`, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "X-User-ID": user?.uid || "",
              "X-User-Email": user?.email || "",
            },
            body: JSON.stringify({ ...data, owner_id: user?.uid }),
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || "Failed to create organization");
          }
          
          const result = await response.json();
          const orgId = result?.organization?._id || result?.organization?.id || result?.id;
          const org = {
            id: orgId,
            name: result?.organization?.name || data.name,
            domain: result?.organization?.domain || data.domain,
            industry: result?.organization?.industry || data.industry,
            size: result?.organization?.size || data.size,
            website_url: result?.organization?.website_url || data.website_url,
            createdAt: result?.organization?.created_at || new Date().toISOString(),
          };
          set({ organization: org, loading: false });
          return org;
        } catch (error: any) {
          set({ error: error.message, loading: false });
          throw error;
        }
      },

      updateSocialLinks: async (orgId, links) => {
        set({ loading: true, error: null });
        try {
          await fetch(`${API_URL}/organizations/${orgId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ social_links: links }),
          });
          set({ socialLinks: links, loading: false });
        } catch (error: any) {
          set({ error: error.message, loading: false });
          throw error;
        }
      },

      detectSocialPresence: async (domain) => {
        set({ loading: true, error: null });
        try {
          const response = await fetch(`${API_URL}/social/detect`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domain }),
          });
          if (!response.ok) throw new Error("Failed to detect social presence");
          const result = await response.json();
          
          const links: SocialLinks = {};
          if (Array.isArray(result.social_links)) {
            result.social_links.forEach((item: any) => {
              if (item.url) {
                links[item.platform] = item.url;
              }
            });
          } else if (result.social_links) {
            Object.assign(links, result.social_links);
          }
          
          set({ socialLinks: links, loading: false });
          return links;
        } catch (error: any) {
          set({ error: error.message, loading: false });
          return {};
        }
      },

      fetchOrganizationByEmail: async (email: string) => {
        set({ loading: true, error: null });
        try {
          const domain = email.split("@")[1];
          const response = await fetch(`${API_URL}/organizations/by-domain/${domain}`);
          if (!response.ok) throw new Error("Organization not found");
          const result = await response.json();
          if (result.organization) {
            const org = {
              id: result.organization._id,
              ...result.organization,
              createdAt: result.organization.created_at,
            };
            set({ organization: org, loading: false });
            return org;
          }
          set({ loading: false });
          return null;
        } catch (error: any) {
          set({ error: error.message, loading: false });
          return null;
        }
      },
    }),
    {
      name: "yesboss-organization",
    }
  )
);
