import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Settings } from "lucide-react";

export function ButtonsCard() {
    return (
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
    );
}
