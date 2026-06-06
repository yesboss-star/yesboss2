"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, Tabs, TabsList, TabsTrigger, TabsContent, Input, Label, Button } from "@/components/ui";
import { Bell, Shield, User, Palette, Save, ArrowLeft } from "lucide-react";

export default function SettingsPage() {
  const router = useRouter();
  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <button onClick={() => router.push("/dashboard/notifications")} className="p-2 rounded-lg hover:bg-surface text-text-muted hover:text-foreground transition-colors cursor-pointer">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-sm text-text-muted mt-1">Manage your account and preferences</p>
          </div>
        </div>

        <Tabs defaultValue="profile">
          <TabsList className="mb-4">
            <TabsTrigger value="profile"><User className="w-4 h-4 mr-2" /> Profile</TabsTrigger>
            <TabsTrigger value="notifications"><Bell className="w-4 h-4 mr-2" /> Notifications</TabsTrigger>
            <TabsTrigger value="security"><Shield className="w-4 h-4 mr-2" /> Security</TabsTrigger>
            <TabsTrigger value="appearance"><Palette className="w-4 h-4 mr-2" /> Appearance</TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Full Name</Label>
                    <Input defaultValue="User" />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input defaultValue="user@company.com" />
                  </div>
                </div>
                <div>
                  <Label>Department</Label>
                  <Input defaultValue="Engineering" />
                </div>
                <div className="flex justify-end">
                  <Button className="cursor-pointer"><Save className="w-4 h-4 mr-2" /> Save Changes</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {["Task assignments", "Goal updates", "Team messages", "Report ready"].map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-2">
                    <span className="text-sm">{item}</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" defaultChecked className="sr-only peer" />
                      <div className="w-9 h-5 bg-border rounded-full peer peer-checked:bg-primary transition-colors" />
                    </label>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Current Password</Label>
                  <Input type="password" />
                </div>
                <div>
                  <Label>New Password</Label>
                  <Input type="password" />
                </div>
                <div className="flex justify-end">
                  <Button className="cursor-pointer">Update Password</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appearance">
            <Card>
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm">Dark Mode</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" defaultChecked className="sr-only peer" />
                    <div className="w-9 h-5 bg-border rounded-full peer peer-checked:bg-primary transition-colors" />
                  </label>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
