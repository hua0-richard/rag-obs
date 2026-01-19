import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export function TabsCard() {
    return (
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
    );
}
