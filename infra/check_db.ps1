$sshKey = "c:\Users\Tauseef\Desktop\Kids Coding Platform\repo\scripts\ssh-key-2026-10-02.key"
$cmd = @'
echo 'SELECT email, "passwordHash" FROM "StaffUser";' | docker exec -i vibe-postgres psql -U vibe -d vibe
'@
ssh -i $sshKey -o StrictHostKeyChecking=no opc@145.241.156.60 $cmd
