import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { usernameSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { collection, query, where, getDocs, doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

const formSchema = z.object({
  username: usernameSchema,
});

export default function UsernameSetup() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { firebaseUser, refetchUser } = useAuth();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!firebaseUser) return;

    setLoading(true);
    try {
      const usernamesRef = collection(db, "users");
      const q = query(usernamesRef, where("username", "==", values.username));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        form.setError("username", { message: "Username is already taken" });
        setLoading(false);
        return;
      }

      const counterDoc = await getDoc(doc(db, "counters", "userId"));
      let nextUserId = 1;
      
      if (counterDoc.exists()) {
        nextUserId = counterDoc.data().current + 1;
      }

      await setDoc(doc(db, "counters", "userId"), { current: nextUserId });

      await setDoc(doc(db, "users", firebaseUser.uid), {
        firebaseUid: firebaseUser.uid,
        username: values.username,
        userId: nextUserId,
        isAdmin: false,
        createdAt: Date.now(),
      });

      await refetchUser();

      toast({
        title: "Welcome to Limited Empire!",
        description: `Your username ${values.username} has been set.`,
      });
    } catch (error: any) {
      console.error("Username setup error:", error);
      toast({
        title: "Setup failed",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Choose Your Username</CardTitle>
          <CardDescription>
            This will be your display name in Limited Empire
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Enter username"
                        data-testid="input-username"
                      />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground">
                      2-20 characters, English letters/numbers only, max 2 underscores
                    </p>
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={loading}
                data-testid="button-submit-username"
              >
                {loading ? "Setting up..." : "Continue"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
