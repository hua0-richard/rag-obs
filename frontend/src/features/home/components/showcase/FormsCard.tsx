import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/shared/components/ui/Card";
import { Input } from "@/shared/components/ui/Input";
import { Textarea } from "@/shared/components/ui/Textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/Select";

export function FormsCard() {
    return (
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
    );
}
