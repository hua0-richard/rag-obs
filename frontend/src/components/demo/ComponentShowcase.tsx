import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Settings, User } from "lucide-react";

export function ComponentShowcase() {
    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    };

    return (
        <section className="relative z-10 max-w-7xl mx-auto px-4 py-20">
            <div className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-4">Interface Components</h2>
                <p className="text-white/60 max-w-2xl">
                    A comprehensive suite of glass-styled components designed for consistent aesthetics and high usability.
                </p>
            </div>

            <motion.div
                variants={container}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-100px" }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
            >
                {/* Buttons Card */}
                <motion.div variants={item} className="col-span-1">
                    <Card className="h-full">
                        <CardHeader>
                            <CardTitle>Buttons</CardTitle>
                            <CardDescription>Interactive triggers with glass states</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap gap-3">
                                <Button>Primary Action</Button>
                                <Button variant="secondary">Secondary</Button>
                                <Button variant="outline">Outline</Button>
                                <Button variant="ghost">Ghost</Button>
                                <Button variant="destructive">Destructive</Button>
                                <Button variant="link">Link Button</Button>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                <Button size="sm">Small</Button>
                                <Button size="lg">Large Action</Button>
                                <Button size="icon"><Settings className="size-4" /></Button>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Inputs & Forms */}
                <motion.div variants={item} className="col-span-1 md:col-span-2">
                    <Card className="h-full">
                        <CardHeader>
                            <CardTitle>Form Elements</CardTitle>
                            <CardDescription>Inputs, selects, and text areas</CardDescription>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <span className="text-sm font-medium text-white/80">Email Address</span>
                                    <Input placeholder="name@example.com" />
                                </div>
                                <div className="space-y-2">
                                    <span className="text-sm font-medium text-white/80">Project Name</span>
                                    <Input placeholder="Enter project name" />
                                </div>
                                <div className="space-y-2">
                                    <span className="text-sm font-medium text-white/80">Role</span>
                                    <Select>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a role" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="admin">Administrator</SelectItem>
                                            <SelectItem value="editor">Editor</SelectItem>
                                            <SelectItem value="viewer">Viewer</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <span className="text-sm font-medium text-white/80">Description</span>
                                    <Textarea placeholder="Type your message here." className="h-[140px]" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Tabs & Navigation */}
                <motion.div variants={item} className="col-span-1 md:col-span-2">
                    <Card className="h-full">
                        <CardHeader>
                            <CardTitle>Tabs & Navigation</CardTitle>
                            <CardDescription>Sectional content organization</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Tabs defaultValue="account" className="w-full">
                                <TabsList className="grid w-full grid-cols-3 mb-6">
                                    <TabsTrigger value="account">Account</TabsTrigger>
                                    <TabsTrigger value="password">Password</TabsTrigger>
                                    <TabsTrigger value="settings">Settings</TabsTrigger>
                                </TabsList>
                                <TabsContent value="account" className="space-y-4">
                                    <div className="glass-panel p-4 rounded-xl border-white/5 bg-white/5">
                                        <h4 className="font-medium text-white mb-2">Account Details</h4>
                                        <p className="text-sm text-white/60">Manage your account information and preferences here.</p>
                                    </div>
                                </TabsContent>
                                <TabsContent value="password">
                                    <div className="glass-panel p-4 rounded-xl border-white/5 bg-white/5">
                                        <h4 className="font-medium text-white mb-2">Change Password</h4>
                                        <p className="text-sm text-white/60">Ensure your account is secure with a strong password.</p>
                                    </div>
                                </TabsContent>
                                <TabsContent value="settings">
                                    <div className="glass-panel p-4 rounded-xl border-white/5 bg-white/5">
                                        <h4 className="font-medium text-white mb-2">Preferences</h4>
                                        <p className="text-sm text-white/60">Customize your interface experience.</p>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Overlays & Status */}
                <motion.div variants={item} className="col-span-1">
                    <Card className="h-full">
                        <CardHeader>
                            <CardTitle>Overlays & Status</CardTitle>
                            <CardDescription>Dialogs, dropdowns, and badges</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex flex-col gap-4">
                                <span className="text-sm font-medium text-white/80">Badges</span>
                                <div className="flex flex-wrap gap-2">
                                    <Badge>Default</Badge>
                                    <Badge variant="secondary">Secondary</Badge>
                                    <Badge variant="outline">Outline</Badge>
                                    <Badge variant="destructive">Critical</Badge>
                                </div>
                            </div>

                            <div className="flex flex-col gap-4">
                                <span className="text-sm font-medium text-white/80">Dialog</span>
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Button variant="outline" className="w-full">Open Dialog</Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Edit Profile</DialogTitle>
                                            <DialogDescription>
                                                Make changes to your profile here. Click save when you're done.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="grid gap-4 py-4">
                                            <div className="grid grid-cols-4 items-center gap-4">
                                                <span className="text-right text-sm text-white/60">Name</span>
                                                <Input id="name" defaultValue="Pedro Duarte" className="col-span-3" />
                                            </div>
                                            <div className="grid grid-cols-4 items-center gap-4">
                                                <span className="text-right text-sm text-white/60">Username</span>
                                                <Input id="username" defaultValue="@peduarte" className="col-span-3" />
                                            </div>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>

                            <div className="flex flex-col gap-4">
                                <span className="text-sm font-medium text-white/80">Dropdown</span>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="secondary" className="w-full justify-between">
                                            Options <MoreHorizontal className="size-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="w-56">
                                        <DropdownMenuLabel>My Account</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem>
                                            <User className="mr-2 size-4" />
                                            <span>Profile</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem>
                                            <Settings className="mr-2 size-4" />
                                            <span>Settings</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="text-red-400 focus:text-red-400 focus:bg-red-900/10">
                                            <span>Log out</span>
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Data Table */}
                <motion.div variants={item} className="col-span-1 md:col-span-3">
                    <Card>
                        <CardHeader>
                            <CardTitle>Data Table</CardTitle>
                            <CardDescription>Dense data display with glass dividers</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[100px]">Invoice</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Method</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {[
                                        { id: "INV001", status: "Paid", method: "Credit Card", amount: "$250.00" },
                                        { id: "INV002", status: "Pending", method: "PayPal", amount: "$150.00" },
                                        { id: "INV003", status: "Unpaid", method: "Bank Transfer", amount: "$350.00" },
                                    ].map((invoice) => (
                                        <TableRow key={invoice.id}>
                                            <TableCell className="font-medium text-white">{invoice.id}</TableCell>
                                            <TableCell>
                                                <Badge variant={invoice.status === 'Paid' ? 'secondary' : invoice.status === 'Pending' ? 'outline' : 'destructive'}>
                                                    {invoice.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-white/70">{invoice.method}</TableCell>
                                            <TableCell className="text-right text-white">{invoice.amount}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </motion.div>

            </motion.div>
        </section>
    );
}
