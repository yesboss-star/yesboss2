"use client";

import { useState } from "react";
import {
  Button,
  Input,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Modal,
  ModalHeader,
  ModalTitle,
  ModalClose,
  ModalContent,
  ModalFooter,
  Select,
  Label,
  Checkbox,
  Textarea,
  Badge,
  Avatar,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui";
import { User, Mail, Search, Settings, LogOut, Plus, MoreVertical } from "lucide-react";

export default function ComponentsDemo() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectValue, setSelectValue] = useState("");
  const [checked, setChecked] = useState(false);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-2">
            UI <span className="gradient-text">Components</span>
          </h1>
          <p className="text-text-muted">Reusable component library built with Radix UI + Tailwind CSS v4</p>
        </div>

        <div className="space-y-12">
          {/* Buttons */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Buttons</h2>
            <div className="flex flex-wrap gap-3">
              <Button variant="default">Default</Button>
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="link">Link</Button>
              <Button loading>Loading</Button>
              <Button size="sm">Small</Button>
              <Button size="lg">Large</Button>
              <Button variant="primary" size="icon"><Plus className="w-4 h-4" /></Button>
            </div>
          </section>

          {/* Inputs */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Inputs</h2>
            <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
              <Input placeholder="Basic input" />
              <Input placeholder="With icon" icon={<User className="w-4 h-4" />} />
              <Input placeholder="With error" error="This field is required" />
              <Input placeholder="Search..." icon={<Search className="w-4 h-4" />} />
            </div>
          </section>

          {/* Select */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Select</h2>
            <div className="max-w-xs">
              <Label className="mb-2 block">Department</Label>
              <Select
                value={selectValue}
                onValueChange={setSelectValue}
                placeholder="Choose a department"
                options={[
                  { value: "engineering", label: "Engineering" },
                  { value: "marketing", label: "Marketing" },
                  { value: "sales", label: "Sales" },
                  { value: "finance", label: "Finance" },
                ]}
              />
            </div>
          </section>

          {/* Checkbox & Textarea */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Checkbox & Textarea</h2>
            <div className="grid sm:grid-cols-2 gap-6 max-w-xl">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox id="agree" checked={checked} onCheckedChange={(c) => setChecked(c as boolean)} />
                  <Label htmlFor="agree" className="cursor-pointer">I agree to terms</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="newsletter" defaultChecked />
                  <Label htmlFor="newsletter" className="cursor-pointer">Subscribe to newsletter</Label>
                </div>
              </div>
              <Textarea placeholder="Write a message..." />
            </div>
          </section>

          {/* Badges */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Badges</h2>
            <div className="flex flex-wrap gap-2">
              <Badge variant="default">Default</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="danger">Danger</Badge>
              <Badge variant="info">Info</Badge>
              <Badge variant="secondary">Secondary</Badge>
            </div>
          </section>

          {/* Avatars */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Avatars</h2>
            <div className="flex items-center gap-4">
              <Avatar size="sm" fallback="JD" />
              <Avatar size="md" fallback="AK" />
              <Avatar size="lg" fallback="SM" />
              <Avatar size="lg" fallback="RP" />
            </div>
          </section>

          {/* Card */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Card</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Revenue Growth</CardTitle>
                  <CardDescription>Monthly recurring revenue</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-primary">$47.2K</div>
                  <Badge variant="success" className="mt-2">+12.5%</Badge>
                </CardContent>
                <CardFooter>
                  <span className="text-xs text-text-muted">Updated 2 min ago</span>
                </CardFooter>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Active Users</CardTitle>
                  <CardDescription>Currently online</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-emerald-400">1,847</div>
                  <Badge variant="info" className="mt-2">+8.2%</Badge>
                </CardContent>
                <CardFooter>
                  <span className="text-xs text-text-muted">Live data</span>
                </CardFooter>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Pending Tasks</CardTitle>
                  <CardDescription>Requires attention</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-amber-400">23</div>
                  <Badge variant="warning" className="mt-2">5 urgent</Badge>
                </CardContent>
                <CardFooter>
                  <span className="text-xs text-text-muted">Across 3 projects</span>
                </CardFooter>
              </Card>
            </div>
          </section>

          {/* Tabs */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Tabs</h2>
            <Tabs defaultValue="overview" className="max-w-xl">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="analytics">Analytics</TabsTrigger>
                <TabsTrigger value="reports">Reports</TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-text-muted text-sm">Overview content goes here. This tab shows a summary of all key metrics and recent activity.</p>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="analytics">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-text-muted text-sm">Analytics content with detailed charts, graphs, and performance breakdowns.</p>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="reports">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-text-muted text-sm">Reports section with downloadable PDFs and scheduled report configurations.</p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </section>

          {/* Tooltip */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Tooltip</h2>
            <TooltipProvider>
              <div className="flex gap-4">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline">Hover me</Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>This is a tooltip!</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="primary">Settings</Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Open settings panel</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </section>

          {/* Dropdown Menu */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Dropdown Menu</h2>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon"><MoreVertical className="w-4 h-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem><User className="w-4 h-4" /> Profile</DropdownMenuItem>
                <DropdownMenuItem><Mail className="w-4 h-4" /> Messages</DropdownMenuItem>
                <DropdownMenuItem><Settings className="w-4 h-4" /> Settings</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-rose-400"><LogOut className="w-4 h-4" /> Log out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </section>

          {/* Modal */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Modal</h2>
            <Button variant="primary" onClick={() => setModalOpen(true)}>Open Modal</Button>

            <Modal open={modalOpen} onOpenChange={setModalOpen} size="md">
              <ModalHeader>
                <ModalTitle>Create New Goal</ModalTitle>
                <ModalClose />
              </ModalHeader>
              <ModalContent>
                <div className="space-y-4">
                  <div>
                    <Label className="mb-2 block">Goal Title</Label>
                    <Input placeholder="e.g. Increase Q2 revenue by 20%" />
                  </div>
                  <div>
                    <Label className="mb-2 block">Description</Label>
                    <Textarea placeholder="Describe the goal and its objectives..." />
                  </div>
                  <div>
                    <Label className="mb-2 block">Priority</Label>
                    <Select
                      value=""
                      onValueChange={() => {}}
                      options={[
                        { value: "high", label: "High" },
                        { value: "medium", label: "Medium" },
                        { value: "low", label: "Low" },
                      ]}
                    />
                  </div>
                </div>
              </ModalContent>
              <ModalFooter>
                <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={() => setModalOpen(false)}>Create Goal</Button>
              </ModalFooter>
            </Modal>
          </section>
        </div>
      </div>
    </div>
  );
}
